const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const mammoth = require('mammoth');
const JSZip = require('jszip'); // mammoth 의존성으로 이미 설치됨 (xlsx 파싱용)
const gemini = require('./gemini');

const app = express();
const PORT = process.env.PORT || 3000;
const VERIFICATION_DIR = path.join(__dirname, 'verification');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

app.use(express.json({ limit: '5mb' }));
app.use(
  express.static(path.join(__dirname, 'public'), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
  })
);

// ---------- docx 파싱 ----------
async function docxToParagraphs(buffer) {
  const { value } = await mammoth.extractRawText({ buffer });
  return value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function hasHangul(s) {
  return /[가-힣]/.test(s);
}

// 병기 docx(원문 EN + 번역 KO가 표 셀 안에 교차) → [{ src, tgt }] 세그먼트 페어.
// 규칙: 셀 내 <p> 순서대로, 한글 없는 단락=원문(EN), 한글 포함=번역(KO).
// EN-run 다음 KO-run을 한 쌍으로 묶음. (셀 내부에 EN→KO 번역이 인접한다는 병기 관행)
async function extractBilingualPairs(buffer) {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const cells = html.match(/<td>[\s\S]*?<\/td>/g) || [];
  const pairs = [];
  const isNoise = (s) => !s || /^\d+$/.test(s) || /^https?:\/\//i.test(s);
  for (const cell of cells) {
    const ps = (cell.match(/<p>[\s\S]*?<\/p>/g) || [])
      .map(stripTags)
      .filter(Boolean);
    let i = 0;
    while (i < ps.length) {
      if (!hasHangul(ps[i])) {
        const en = [];
        while (i < ps.length && !hasHangul(ps[i])) en.push(ps[i++]);
        const ko = [];
        while (i < ps.length && hasHangul(ps[i])) ko.push(ps[i++]);
        const src = en.join(' ').trim();
        const tgt = ko.join(' ').trim();
        if (isNoise(src) && !tgt) continue; // 번호/URL 단독 행 제외
        pairs.push({ src, tgt });
      } else {
        const ko = [];
        while (i < ps.length && hasHangul(ps[i])) ko.push(ps[i++]);
        pairs.push({ src: '', tgt: ko.join(' ').trim() }); // 원문 없는 KO(표제 등)
      }
    }
  }
  return pairs.filter((p) => p.src || p.tgt);
}

// 병기 파일 판별 — EN/KO가 한 세그먼트에 함께 있는 페어가 충분한가.
function isBilingual(pairs) {
  const both = pairs.filter((p) => p.src && p.tgt).length;
  return both >= 3;
}

// 정렬된 세그먼트 페어를 용어집 기준으로 검사. 정렬을 알기에 term 검사가 세그먼트 로컬로 정확.
// 판정은 오직 용어집 규칙. 다의어 여부는 번역가가 용어집 수정으로 결정(에이전트는 추측 안 함).
function checkBilingual(pairs, glossary) {
  const terms = glossary.filter((e) => e.type === 'term' && e.source);
  let untranslated = 0;

  const segments = [];
  for (let idx = 0; idx < pairs.length; idx++) {
    const p = pairs[idx];
    const issues = [];
    let skipped = 0;
    if (p.src && p.tgt) {
      for (const e of terms) {
        if (!contains(p.src, e.source)) continue;
        const has = targetHasExpected(p.tgt, e.target);
        // 미준수: 원문에 용어 있으나 용어집 기대 번역어(어느 의미도) 미등장.
        if (has === false) issues.push({ term: e.source, expected: e.target });
        else if (has === null) skipped++; // 주석형/1자 → 자동검사 불가
      }
    }

    let status = 'ok';
    if (p.src && !p.tgt) {
      status = 'untranslated';
      untranslated++;
    } else if (issues.length) {
      status = 'fail';
    }
    segments.push({ idx, src: p.src, tgt: p.tgt, issues, status, skipped });
  }

  return {
    segments,
    summary: {
      pairs: segments.length,
      fail: segments.filter((s) => s.status === 'fail').length,
      untranslated,
      ok: segments.filter((s) => s.status === 'ok').length,
      termsChecked: terms.length,
    },
  };
}

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 용어집 docx(표) → [{ source, target, type }]
async function parseGlossaryDocx(filePath) {
  const { value: html } = await mammoth.convertToHtml({ path: filePath });
  const entries = [];
  const rows = html.match(/<tr>[\s\S]*?<\/tr>/g) || [];
  for (const row of rows) {
    const cells = (row.match(/<td>[\s\S]*?<\/td>/g) || []).map(stripTags);
    if (cells.length < 2) continue;
    const source = cells[0];
    const target = cells[1];
    if (!source) continue;
    // 헤더 행 스킵
    if (/원문/.test(source) && /용어/.test(source)) continue;
    if (source === '원문 용어') continue;
    entries.push({ source, target, type: classify(target) });
  }
  return entries;
}

function unescapeXml(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// 용어집 xlsx(시트) → [{ source, target, type }]. A열=원문, B열=번역.
// 의존성 없이 jszip으로 OOXML 직접 파싱 (sharedStrings + 첫 워크시트).
async function parseGlossaryXlsx(filePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));

  // 공유 문자열 테이블
  const ssXml = zip.file('xl/sharedStrings.xml')
    ? await zip.file('xl/sharedStrings.xml').async('string')
    : '';
  const shared = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(ssXml))) {
    const texts = m[1].match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
    shared.push(unescapeXml(texts.map((t) => t.replace(/<[^>]*>/g, '')).join('')));
  }

  // 첫 워크시트
  const sheetName =
    Object.keys(zip.files).find((f) => /^xl\/worksheets\/sheet1\.xml$/.test(f)) ||
    Object.keys(zip.files).find((f) => /^xl\/worksheets\/.*\.xml$/.test(f));
  if (!sheetName) return [];
  const sheetXml = await zip.file(sheetName).async('string');

  const entries = [];
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  const cellRe = /<c\s+([^>\/]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let r;
  while ((r = rowRe.exec(sheetXml))) {
    const cells = {};
    let c;
    cellRe.lastIndex = 0;
    while ((c = cellRe.exec(r[1]))) {
      const attrs = c[1];
      const inner = c[2];
      const refM = attrs.match(/r="([A-Z]+)\d+"/);
      if (!refM) continue;
      const col = refM[1];
      const type = (attrs.match(/t="([^"]+)"/) || [])[1];
      let val = '';
      if (inner != null) {
        if (type === 's') {
          const vM = inner.match(/<v>([\s\S]*?)<\/v>/);
          if (vM) val = shared[parseInt(vM[1], 10)] || '';
        } else if (type === 'inlineStr') {
          const tM = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
          if (tM) val = unescapeXml(tM[1]);
        } else {
          const vM = inner.match(/<v>([\s\S]*?)<\/v>/);
          if (vM) val = unescapeXml(vM[1]);
        }
      }
      cells[col] = val;
    }
    const source = (cells['A'] || '').trim();
    const target = (cells['B'] || '').trim();
    if (!source) continue;
    // 헤더/구분 행 스킵
    if (/원문/.test(source) && /용어/.test(source)) continue;
    if (source === '원문 용어') continue;
    entries.push({ source, target, type: classify(target) });
  }
  return entries;
}

// 번역어 셀이 깔끔한 단일 용어인지(term), 설명형 기준인지(note) 판별
function classify(target) {
  const t = (target || '').trim();
  if (!t) return 'note';
  if (/여러 용어|번역되어 있음|통일|번역할 것|번역 바랍|평서체|병기|그대로|\d\)/.test(t))
    return 'note';
  // 문장부호로 끝나는 긴 설명 → note
  if (t.length > 20 && /[.。]$/.test(t)) return 'note';
  return 'term';
}

// 용어집 파일만 선별(.docx/.xlsx). 번역 대상 문서의 표 오염 방지 위해
// 파일명에 "용어집"/"준수기준" 포함된 것만 용어집으로 간주.
function isGlossaryFile(f) {
  if (f.startsWith('~$')) return false;
  if (!/\.(docx|xlsx)$/i.test(f)) return false;
  return /용어집|준수기준/.test(f);
}

// verification 폴더의 용어집(.docx/.xlsx) 병합 로드
async function loadGlossary() {
  let files = [];
  try {
    files = fs.readdirSync(VERIFICATION_DIR).filter(isGlossaryFile);
  } catch (e) {
    return { entries: [], files: [], error: 'verification 폴더를 찾을 수 없습니다.' };
  }
  const all = [];
  for (const f of files) {
    try {
      const full = path.join(VERIFICATION_DIR, f);
      const e = /\.xlsx$/i.test(f)
        ? await parseGlossaryXlsx(full)
        : await parseGlossaryDocx(full);
      e.forEach((x) => (x.file = f));
      all.push(...e);
    } catch (err) {
      console.error('용어집 파싱 실패:', f, err.message);
    }
  }

  const savedPath = path.join(VERIFICATION_DIR, 'glossary_saved.json');
  let savedEntries = [];
  if (fs.existsSync(savedPath)) {
    try {
      savedEntries = JSON.parse(fs.readFileSync(savedPath, 'utf8')) || [];
    } catch (err) {
      console.error('저장된 용어집 JSON 로드 실패:', err.message);
      savedEntries = [];
    }
  }

  // 동일 원문 용어의 여러 행을 병합 — 모든 번역 의미를 허용(다의어 처리, 옵션 1).
  // 예: report→신고, report→보고서  ⇒  report→"신고/보고서". expectedVariants가 분리해 둘 다 통과.
  const byKey = new Map();
  for (const e of all) {
    const key = e.source.toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, { ...e });
      continue;
    }
    const cur = byKey.get(key);
    const splitVariants = (value) =>
    String(value || '')
      .split(/[,/、·／・]/)
      .map((s) => s.trim())
      .filter(Boolean);
  const senses = new Set(splitVariants(cur.target));
  splitVariants(e.target).forEach((s) => senses.add(s));
  cur.target = [...senses].join('/');
    cur.type = classify(cur.target); // 병합 후 재분류
    if (e.file && cur.file && !cur.file.split(', ').includes(e.file))
      cur.file += ', ' + e.file;
  }

  for (const e of savedEntries) {
    const key = (e.source || '').toLowerCase();
    if (!key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, { ...e, file: '저장본' });
      continue;
    }
    const cur = byKey.get(key);
    cur.target = e.target || cur.target;
    cur.type = e.type || classify(cur.target);
    if (!cur.file || !cur.file.includes('저장본')) {
      cur.file = cur.file ? cur.file + ', 저장본' : '저장본';
    }
  }

  const merged = [...byKey.values()];
  return { entries: merged, files };
}

// ---------- 용어 중심 매칭 엔진 (단락 정렬 가정 없음) ----------
function escRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 기대 번역어에서 검사 가능한 변형 추출. "작업장, 설립"→["작업장","설립"],
// "소(형용사)"→괄호주석 제거 후 "소"(1자)→ 제외. 콤마/슬래시/가운뎃점 분리.
function expectedVariants(target) {
  return String(target || '')
    .split(/[,/、·／・]/)
    .map((s) =>
      s
        .replace(/\([^)]*\)/g, '')
        .replace(/^[\s"'“”‘’«»·•\-–—]+|[\s"'“”‘’«»·•\-–—]+$/g, '')
        .replace(/[.,;]+$/, '')
        .trim()
    )
    .filter((s) => s.length >= 2);
}

// tgt가 기대 번역어(변형 중 하나)를 포함하는가. true/false/null(검사불가).
function targetHasExpected(tgt, target) {
  const vs = expectedVariants(target);
  if (vs.length === 0) return null; // 주석형/1자 용어 → 자동검사 불가
  return vs.some((v) => contains(tgt, v));
}

function contains(text, term) {
  // ASCII 용어(영문/약어)는 단어 경계 매칭 — 짧은 약어의 substring 오매칭 방지
  // (예: "CA"→"cargo", "RA"→"transit"). 한글 용어는 경계 개념이 약해 substring 유지.
  if (/^[\x00-\x7F]+$/.test(term)) {
    const re = new RegExp(
      '(^|[^A-Za-z0-9])' + escRe(term) + '($|[^A-Za-z0-9])',
      'i'
    );
    return re.test(text);
  }
  // 한글 용어: 공백 무시 substring (예 "관할기관" ↔ "관할 기관")
  const n = (s) => s.replace(/\s+/g, '').toLowerCase();
  return n(text).includes(n(term));
}

function countTermOccurrences(text, term) {
  if (!term || !text) return 0;
  if (/^[\x00-\x7F]+$/.test(term)) {
    const re = new RegExp(
      '(^|[^A-Za-z0-9])' + escRe(term) + '(?=$|[^A-Za-z0-9])',
      'gi'
    );
    let count = 0;
    while (re.exec(text)) {
      count++;
      if (re.lastIndex === 0) break;
    }
    return count;
  }
  const n = (s) => s.replace(/\s+/g, '').toLowerCase();
  const haystack = n(text);
  const needle = n(term);
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

// 이 용어(term)를 부분으로 포함하는 더 긴 용어(상위 용어) 목록.
//  예: term="cow" → ["mad cow disease"]. 짧은 용어의 substring 오매칭 방지용.
function superSources(term, glossary) {
  const out = [];
  for (const e of glossary || []) {
    const s = e && e.source;
    if (!s || s === term) continue;
    if (s.length <= term.length) continue;
    if (contains(s, term)) out.push(s);
  }
  return out;
}

// text에서 상위 용어 출현부를 공백으로 가림 → 그 안의 짧은 용어 오매칭 방지.
//  예: "mad cow disease → 광우병" 문장에서 "cow"를 세지 않도록 "mad cow disease"를 마스킹.
//  (길이 보존 치환으로 인덱스 유지)
function maskSuperTerms(text, supers) {
  let masked = String(text || '');
  for (const s of supers || []) {
    const re = /^[\x00-\x7F]+$/.test(s)
      ? new RegExp('(?<=^|[^A-Za-z0-9])' + escRe(s) + '(?=$|[^A-Za-z0-9])', 'gi')
      : new RegExp(escRe(s), 'gi');
    masked = masked.replace(re, (m) => ' '.repeat(m.length));
  }
  return masked;
}

// note 기준에서 후보 번역어 추출 (예: "1) 안전 및 보안 수입신고 2) 반입신고 ...")
function extractCandidates(noteText) {
  const out = [];
  const parts = noteText.split(/\d\)/).slice(1); // 숫자) 뒤 조각들
  for (const p of parts) {
    const c = p.replace(/등.*$/, '').replace(/[.,]/g, '').trim();
    if (c) out.push(c);
  }
  return out;
}

// "여러 용어로 번역되어 있음" + 열거형(1)..2)..) note → 통일 규칙으로 간주.
// 변형 후보 목록(2개 이상) 반환, 아니면 null. (규칙 기반 통일검사용)
function parseUniformityRule(noteText) {
  const t = noteText || '';
  if (!/여러 용어|통일/.test(t)) return null;
  const variants = extractCandidates(t);
  return variants.length >= 2 ? variants : null;
}

async function checkGlossary(sourceParas, targetParas, glossary) {
  const results = [];
  const useLLM = gemini.hasKey();
  let llmCalls = 0;
  let llmError = null;

  for (const entry of glossary) {
    const S = entry.source;
    if (!S) continue;

    // 이 용어를 포함하는 더 긴 용어(예: "cow"에 대한 "mad cow disease")는 별도 용어이므로
    // 원문에서 그 출현부를 가려 짧은 용어의 오매칭(오탐)을 막는다.
    const supers = superSources(S, glossary);
    const srcHits = [];
    let srcCount = 0;
    sourceParas.forEach((p, i) => {
      const count = countTermOccurrences(maskSuperTerms(p, supers), S);
      if (count > 0) {
        srcHits.push({ index: i, text: p });
        srcCount += count;
      }
    });

    // 원문에 해당 용어가 없으면 검사 대상 아님
    if (srcCount === 0) {
      results.push({ entry, status: 'na', srcHits: [], srcCount: 0, tgtHits: [] });
      continue;
    }

    if (entry.type === 'term') {
      const T = entry.target;
      // 기대 번역어의 모든 의미(변형) 중 하나라도 등장하면 인정 — 다의어 처리(옵션 1).
      const variants = expectedVariants(T);
      const tgtHits = [];
      targetParas.forEach((p, i) => {
        if (variants.some((v) => contains(p, v))) tgtHits.push({ index: i, text: p });
      });
      let status;
      if (variants.length === 0)
        status = 'manual'; // 주석형/1자 용어 → 자동검사 불가
      else if (tgtHits.length === 0) status = 'fail'; // 기대 번역어(어느 의미도) 미사용
      else if (tgtHits.length < srcCount) status = 'warn'; // 일부만 적용
      else status = 'pass';
      results.push({ entry, status, srcHits, srcCount, tgtHits, expected: T });
    } else {
      // note: 설명형 기준. 후보 번역어 + 동일표기 포함 번역문 단락 수집.
      const candidates = extractCandidates(entry.target);
      const tgtHits = [];
      targetParas.forEach((p, i) => {
        if (contains(p, S) || candidates.some((c) => contains(p, c)))
          tgtHits.push({ index: i, text: p });
      });

      // 통일 규칙(열거형 "여러 용어로 번역되어 있음")은 LLM 없이 규칙 기반 판정.
      // 번역문에 실제 등장하는 서로 다른 변형을 모아, 2종 이상 혼용일 때만 fail.
      const uniformityVariants = parseUniformityRule(entry.target);
      if (uniformityVariants) {
        const found = [];
        for (const v of uniformityVariants) {
          if (targetParas.some((p) => contains(p, v))) found.push(v);
        }
        let status = 'pass';
        let violations = [];
        if (found.length >= 2) {
          status = 'fail'; // 통일되지 않음 — 변형 혼용
          violations = found.map((v) => ({
            target_excerpt: v,
            problem: `통일되지 않은 변형 (${found.length}종 혼용: ${found.join(', ')})`,
            suggestion: '한 가지 번역어로 통일',
          }));
        }
        results.push({
          entry,
          status,
          srcHits,
          tgtHits,
          note: entry.target,
          violations,
          foundVariants: found,
          judgedByRule: true,
        });
        continue;
      }

      if (!useLLM) {
        // 키 없으면 수동검토로 폴백
        results.push({ entry, status: 'manual', srcHits, tgtHits, note: entry.target });
        continue;
      }

      // LLM 판정 (토큰 제한 위해 발췌 상한)
      try {
        const { violations, parseError } = await gemini.judgeNoteRule({
          term: S,
          criterion: entry.target,
          srcParas: srcHits.slice(0, 30).map((h) => h.text),
          tgtParas: tgtHits.slice(0, 30).map((h) => h.text),
        });
        llmCalls++;
        if (parseError) llmError = parseError;
        results.push({
          entry,
          status: violations.length ? 'fail' : 'pass',
          srcHits,
          tgtHits,
          note: entry.target,
          violations,
          judgedByLLM: true,
        });
      } catch (e) {
        llmError = e.message;
        results.push({ entry, status: 'manual', srcHits, tgtHits, note: entry.target });
      }
    }
  }

  results._llm = { used: useLLM, calls: llmCalls, error: llmError };

  const flagged = results.filter((r) =>
    ['fail', 'warn', 'manual'].includes(r.status)
  );
  return {
    results,
    summary: {
      totalTerms: glossary.length,
      checked: results.filter((r) => r.status !== 'na').length,
      fail: results.filter((r) => r.status === 'fail').length,
      warn: results.filter((r) => r.status === 'warn').length,
      manual: results.filter((r) => r.status === 'manual').length,
      pass: results.filter((r) => r.status === 'pass').length,
      ruleJudged: results.filter((r) => r.judgedByRule).length,
      flaggedCount: flagged.length,
      sourceCount: sourceParas.length,
      targetCount: targetParas.length,
      llm: results._llm,
    },
  };
}

// ---------- 문체(평서체/경어체) 검수 ----------
// 번역문 문장 종결어 기준 분류:
//  - 경어체: '-니다'로 끝남 (합니다/습니다/입니다/아닙니다 등)
//  - 평서체: '아니다'(부정 예외) 또는 '-니다'가 아닌 '-다'로 끝남 (이다/간다/한다/있다 등)
//  - 검토대상: 위 규칙으로 분류 불가한 종결어 → 번역가 검토/수정 필요
function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?。…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// 반환: 'plain' | 'honorific' | 'review' | 'exclude'
//  - exclude: 한글 종결어미 문장이 아님 → 검토 대상 아님 (원문 영어/숫자, 명사·명사형 종결)
function classifyStyle(sentence) {
  // 끝의 문장부호/따옴표/괄호/기호 제거 후 종결 글자 판정
  let s = String(sentence || '')
    .trim()
    .replace(/[\s.!?。…"'”’`)\]\}>」』〉》·•\-–—:;：；,，]+$/u, '');
  if (!s) return 'exclude';
  const last = s[s.length - 1];
  // 한글로 끝나지 않으면(영어 원문/숫자/기호) 검토 대상 아님
  if (!/[가-힣]/.test(last)) return 'exclude';

  // 명사형 종결 제외: -(으)ㅁ(받침 ㅁ: 음/함/됨/만듦…) 또는 -기
  if (/기$/.test(s)) return 'exclude';
  const code = last.charCodeAt(0) - 0xac00; // 완성형 한글 음절 분해
  if (code >= 0 && code <= 11171) {
    const jong = code % 28; // 종성 index (ㅁ = 16)
    if (jong === 16) return 'exclude'; // -ㅁ 받침 → 명사형/명사 종결
  }

  // 평서체/경어체 (종결어미 '-다' 계열)
  if (s.endsWith('아니다')) return 'plain'; // 예외: 부정의 평서체
  if (s.endsWith('니다')) return 'honorific'; // -ㅂ니다/습니다/입니다/아닙니다
  if (s.endsWith('다')) return 'plain'; // -ㅣ다/-ㄴ다/한다/있다 등

  // 그 외 한글 종결어미(해요체/의문/명령 등) → 번역가 검토대상
  if (/(요|죠|까)$/.test(s) || /시오$/.test(s)) return 'review';

  // 명사 종결 등 종결어미 아님 → 제외
  return 'exclude';
}

function checkStyle(targetParas) {
  const items = [];
  let plain = 0;
  let honorific = 0;
  let review = 0;
  let excluded = 0;
  (targetParas || []).forEach((p, pi) => {
    splitSentences(p).forEach((sent) => {
      const style = classifyStyle(sent);
      if (style === 'exclude') {
        excluded++; // 원문 영어/명사형 등 — 화면에서 제외
        return;
      }
      if (style === 'plain') plain++;
      else if (style === 'honorific') honorific++;
      else review++;
      items.push({ paraIndex: pi, text: sent, style });
    });
  });
  const total = plain + honorific + review;
  let dominant = 'none';
  if (plain > 0 || honorific > 0) dominant = plain >= honorific ? 'plain' : 'honorific';
  const mixed = plain > 0 && honorific > 0;
  return { items, summary: { total, plain, honorific, review, excluded, dominant, mixed } };
}

// ---------- 라우트 ----------
app.get('/api/glossary', async (req, res) => {
  const g = await loadGlossary();
  res.json(g);
});

// 병기 단일파일 검수 — 좌우 정렬 세그먼트 페어 추출 후 용어 검사.
app.post('/api/check-bilingual', upload.single('doc'), async (req, res) => {
  try {
    const file = req.file;
    if (!file)
      return res.status(400).json({ error: '병기 .docx 파일을 업로드하세요.' });
    if (!/\.docx$/i.test(file.originalname))
      return res.status(400).json({
        error: '지원하지 않는 형식입니다. .docx 파일만 업로드할 수 있습니다.',
      });

    const { entries: glossary, files } = await loadGlossary();
    if (glossary.length === 0)
      return res.status(400).json({
        error: 'verification 폴더에서 용어집을 불러오지 못했습니다.',
      });

    const pairs = await extractBilingualPairs(file.buffer);
    if (pairs.length === 0)
      return res.status(400).json({
        error:
          '병기 세그먼트를 추출하지 못했습니다. 표 안에 원문/번역이 함께 있는 병기 파일인지 확인하세요.',
      });

    const out = checkBilingual(pairs, glossary);
    out.glossaryFiles = files;
    res.json(out);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: '병기 검수 처리 중 오류가 발생했습니다: ' + err.message });
  }
});

// 서버 용어집 로드 + 클라이언트 용어집(있으면) 우선 적용.
async function resolveGlossary(clientGlossaryRaw) {
  let { entries: glossary, files } = await loadGlossary();
  if (clientGlossaryRaw) {
    try {
      const clientGlossary = JSON.parse(clientGlossaryRaw);
      if (Array.isArray(clientGlossary) && clientGlossary.length > 0) {
        glossary = clientGlossary;
      }
    } catch (e) {
      // 잘못된 클라 용어집 JSON은 무시하고 서버 용어집 사용
    }
  }
  return { glossary, files };
}

// 정렬된 원문/번역 단위 배열 → 용어집 검수 결과(out) 조립. (파일 파싱 이후 공통 파이프라인)
async function buildCheckResult(srcUnits, tgtUnits, glossary, files) {
  const out = await checkGlossary(srcUnits, tgtUnits, glossary);

  const n = Math.max(srcUnits.length, tgtUnits.length);
  const alignedPairs = [];
  for (let i = 0; i < n; i++) {
    const src = srcUnits[i] || '';
    const tgt = tgtUnits[i] || '';
    if (src && tgt && src.trim() === tgt.trim()) continue;
    alignedPairs.push({ src, tgt });
  }

  for (const r of out.results) {
    if (r.entry.type !== 'term') continue;
    const supers = superSources(r.entry.source, glossary);
    const matches = alignedPairs.filter(
      (p) => p.src && contains(maskSuperTerms(p.src, supers), r.entry.source)
    );
    r.matchCount = r.srcCount != null ? r.srcCount : r.srcHits ? r.srcHits.length : matches.length;
    r.pairs = matches
      .filter((p) => !(p.src && p.tgt && p.src.trim() === p.tgt.trim()))
      .map((p) => ({
        src: p.src,
        tgt: p.tgt,
        ok: targetHasExpected(p.tgt, r.entry.target) === true,
      }));
  }

  out.alignedPairs = alignedPairs;
  out.glossaryFiles = files;
  out.style = checkStyle(tgtUnits);
  return out;
}

app.post(
  '/api/check',
  upload.fields([
    { name: 'source', maxCount: 1 },
    { name: 'target', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const srcFile = req.files && req.files.source && req.files.source[0];
      const tgtFile = req.files && req.files.target && req.files.target[0];

      if (!srcFile || !tgtFile)
        return res
          .status(400)
          .json({ error: '원문과 번역문 .docx 파일을 모두 업로드하세요.' });

      if (!/\.docx$/i.test(srcFile.originalname) || !/\.docx$/i.test(tgtFile.originalname))
        return res.status(400).json({
          error: '지원하지 않는 형식입니다. .docx 파일만 업로드할 수 있습니다.',
        });

      const { glossary, files } = await resolveGlossary(req.body && req.body.glossary);
      if (glossary.length === 0)
        return res.status(400).json({
          error:
            'verification 폴더에서 용어집을 불러오지 못했습니다. .docx 용어집을 확인하세요.',
        });

      // 모든 입력을 좌우 정렬로 통일.
      // 병기 파일은 내부에 EN→KO 페어가 이미 정렬돼 있음 → 그 페어를 정렬 기준으로 사용.
      // - 번역문 슬롯이 병기: 좌측=병기 내부 EN, 우측=병기 내부 KO (완벽 정렬).
      //   원문 슬롯에 별도 EN 파일을 올려도 무시(병기문 자체 EN이 곧 원문).
      // - 원문 슬롯만 병기: 좌측=병기 EN, 우측=병기 KO.
      // - 둘 다 분리 평문: 각 단락 인덱스 1:1 정렬(평행 구조 가정).
      const [srcPairs, tgtPairs] = await Promise.all([
        extractBilingualPairs(srcFile.buffer),
        extractBilingualPairs(tgtFile.buffer),
      ]);
      let srcUnits, tgtUnits;
      if (isBilingual(tgtPairs)) {
        srcUnits = tgtPairs.map((p) => p.src);
        tgtUnits = tgtPairs.map((p) => p.tgt);
      } else if (isBilingual(srcPairs)) {
        srcUnits = srcPairs.map((p) => p.src);
        tgtUnits = srcPairs.map((p) => p.tgt);
      } else {
        srcUnits = await docxToParagraphs(srcFile.buffer);
        tgtUnits = await docxToParagraphs(tgtFile.buffer);
      }

      if (srcUnits.length === 0 && tgtUnits.length === 0)
        return res.status(400).json({
          error: '문서에서 텍스트를 추출하지 못했습니다. 파일을 확인하세요.',
        });

      const out = await buildCheckResult(srcUnits, tgtUnits, glossary, files);
      res.json(out);
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ error: '검수 처리 중 오류가 발생했습니다: ' + err.message });
    }
  }
);

// 큰 .docx(이미지 포함)를 Vercel 4.5MB 한도 없이 검수하기 위한 경로.
// 클라이언트가 브라우저에서 문서 텍스트를 미리 추출해 srcUnits/tgtUnits(문자열 배열)로 전송.
// 파일 업로드 대신 작은 JSON만 오가므로 용량 무관. (수정본 .docx 내보내기는 원본 필요 → 로컬 사용)
app.post('/api/check-text', async (req, res) => {
  try {
    const b = req.body || {};
    const srcUnits = Array.isArray(b.srcUnits) ? b.srcUnits.filter((s) => s && s.trim()) : [];
    const tgtUnits = Array.isArray(b.tgtUnits) ? b.tgtUnits.filter((s) => s && s.trim()) : [];

    if (srcUnits.length === 0 && tgtUnits.length === 0)
      return res.status(400).json({
        error: '문서에서 텍스트를 추출하지 못했습니다. 파일을 확인하세요.',
      });

    const { glossary, files } = await resolveGlossary(
      b.glossary ? (typeof b.glossary === 'string' ? b.glossary : JSON.stringify(b.glossary)) : null
    );
    if (glossary.length === 0)
      return res.status(400).json({
        error: 'verification 폴더에서 용어집을 불러오지 못했습니다. .docx 용어집을 확인하세요.',
      });

    const out = await buildCheckResult(srcUnits, tgtUnits, glossary, files);
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '검수 처리 중 오류가 발생했습니다: ' + err.message });
  }
});

// 편집 전/후 텍스트에서 바뀐 "토큰"을 추출(공백 경계까지 확장).
// 예: "관할 사업장에 대해" → "관할 작업장에 대해"  ⇒  find:"사업장에" replace:"작업장에".
// 최소 diff가 1글자('사'→'작')로 좁아 과치환되는 것을 막기 위해 공백 경계로 확장.
function diffToken(before, after) {
  if (before === after) return null;
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let s = 0;
  while (
    s < before.length - p &&
    s < after.length - p &&
    before[before.length - 1 - s] === after[after.length - 1 - s]
  )
    s++;
  // 공백(또는 시작/끝) 경계까지 양쪽으로 확장 → 부분음절이 아닌 단어 단위로.
  while (p > 0 && !/\s/.test(before[p - 1])) p--;
  while (s > 0 && !/\s/.test(before[before.length - s])) s--;
  const find = before.slice(p, before.length - s);
  const replace = after.slice(p, after.length - s);
  if (!find) return null; // 순수 삽입(원본 빈 셀에 입력)은 위치 특정 불가 → 건너뜀
  return { find, replace };
}

// document.xml의 <w:t> 텍스트 노드 안에서만 치환(서식 run 보존). 토큰별 횟수 제한.
function applyReplacements(xml, repls) {
  let applied = 0;
  const out = xml.replace(
    /(<w:t[^>]*>)([\s\S]*?)(<\/w:t>)/g,
    (m, open, inner, close) => {
      let t = inner;
      for (const r of repls) {
        if (r.remaining <= 0 || !r.find) continue;
        let idx;
        while (r.remaining > 0 && (idx = t.indexOf(r.find)) >= 0) {
          t = t.slice(0, idx) + r.replace + t.slice(idx + r.find.length);
          r.remaining--;
          applied++;
        }
      }
      return open + t + close;
    }
  );
  return { xml: out, applied };
}

// 수정본 내보내기 — 편집된 번역문을 업로드된 .docx에 반영해 새 파일로 반환(원본 보존).
app.post('/api/export', upload.single('target'), async (req, res) => {
  try {
    const file = req.file;
    if (!file)
      return res.status(400).json({ error: '번역문 .docx 파일이 필요합니다.' });
    if (!/\.docx$/i.test(file.originalname))
      return res
        .status(400)
        .json({ error: '.docx 파일만 내보낼 수 있습니다.' });

    let edits = [];
    try {
      edits = JSON.parse(req.body.edits || '[]');
    } catch (e) {
      return res.status(400).json({ error: '수정 내역 파싱 실패.' });
    }
    if (!Array.isArray(edits) || edits.length === 0)
      return res.status(400).json({ error: '반영할 수정 내역이 없습니다.' });

    // 편집 → 토큰 치환 목록(동일 토큰 병합, remaining=발생 횟수).
    const map = new Map();
    for (const e of edits) {
      const d = diffToken(String(e.before || ''), String(e.after || ''));
      if (!d || d.find === d.replace) continue;
      const key = d.find + ' ' + d.replace;
      if (map.has(key)) map.get(key).remaining++;
      else map.set(key, { find: d.find, replace: d.replace, remaining: 1 });
    }
    const repls = [...map.values()];
    if (repls.length === 0)
      return res
        .status(400)
        .json({ error: '치환 가능한 용어 변경을 찾지 못했습니다(빈 셀 입력 등은 제외).' });

    const zip = await JSZip.loadAsync(file.buffer);
    const docFile = zip.file('word/document.xml');
    if (!docFile)
      return res.status(400).json({ error: 'docx 구조 오류: document.xml 없음.' });
    const xml = await docFile.async('string');
    const { xml: newXml, applied } = applyReplacements(xml, repls);
    zip.file('word/document.xml', newXml);

    const outBuf = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    const base = file.originalname.replace(/\.docx$/i, '');
    const outName = `${base}_수정본.docx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('X-Applied', String(applied));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(outName)}`
    );
    res.send(outBuf);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: '수정본 생성 중 오류: ' + err.message });
  }
});

async function buildGlossaryXlsxBuffer(glossary) {
  const zip = new JSZip();
  const sharedStrings = [];
  const rows = [];

  rows.push(['A1', 'B1', 'C1'].map((ref, i) => {
    sharedStrings.push(['원문 용어', '번역문 용어 / 기준', '유형'][i]);
    return { t: 's', v: sharedStrings.length - 1, r: ref };
  }));

  for (let i = 0; i < glossary.length; i++) {
    const e = glossary[i];
    const rowNum = i + 2;
    const cellRefs = [`A${rowNum}`, `B${rowNum}`, `C${rowNum}`];
    const cells = [];
    [e.source || '', e.target || '', e.type === 'term' ? '자동' : '수동'].forEach((val, j) => {
      sharedStrings.push(val);
      cells.push({ t: 's', v: sharedStrings.length - 1, r: cellRefs[j] });
    });
    rows.push(cells);
  }

  let ssXml = '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + sharedStrings.length + '" uniqueCount="' + sharedStrings.length + '">';
  sharedStrings.forEach((s) => {
    ssXml += '<si><t>' + (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</t></si>';
  });
  ssXml += '</sst>';

  let sheetXml = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    sheetXml += `<row r="${rowIdx + 1}">`;
    for (const cell of rows[rowIdx]) {
      sheetXml += `<c r="${cell.r}" t="${cell.t}"><v>${cell.v}</v></c>`;
    }
    sheetXml += '</row>';
  }
  sheetXml += '</sheetData></worksheet>';

  zip.file('xl/sharedStrings.xml', ssXml);
  zip.file('xl/worksheets/sheet1.xml', sheetXml);
  zip.file('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="용어집" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>');
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>');

  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

app.post('/api/save-glossary', express.json(), async (req, res) => {
  try {
    const glossary = req.body.glossary || [];
    if (!Array.isArray(glossary) || glossary.length === 0) {
      return res.status(400).json({ error: '저장할 용어집이 비어 있습니다.' });
    }

    fs.mkdirSync(VERIFICATION_DIR, { recursive: true });
    const buf = await buildGlossaryXlsxBuffer(glossary);

    const files = fs.readdirSync(VERIFICATION_DIR).filter(isGlossaryFile);
    const destinationFile = files.length
      ? path.join(VERIFICATION_DIR, files[0])
      : path.join(VERIFICATION_DIR, '번역준수기준(용어집).xlsx');

    fs.writeFileSync(destinationFile, buf);

    const jsonPath = path.join(VERIFICATION_DIR, 'glossary_saved.json');
    fs.writeFileSync(jsonPath, JSON.stringify(glossary, null, 2), 'utf8');

    res.json({ file: path.basename(destinationFile), json: 'glossary_saved.json' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '용어집 저장 중 오류: ' + err.message });
  }
});

// ---------- 용어집 엑셀 내보내기 ----------
app.post('/api/export-glossary', express.json(), async (req, res) => {
  try {
    const glossary = req.body.glossary || [];
    if (!Array.isArray(glossary) || glossary.length === 0) {
      return res.status(400).json({ error: '용어집이 비어있습니다.' });
    }

    // 간단한 XLSX 생성 (xlsx 라이브러리 대신 직접 생성)
    const zip = new JSZip();
    
    // 공유 문자열 테이블과 워크시트 작성
    const sharedStrings = [];
    const rows = [];
    
    // 헤더
    rows.push(['A1', 'B1', 'C1'].map((ref, i) => {
      sharedStrings.push(['원문 용어', '번역문 용어 / 기준', '유형'][i]);
      return { t: 's', v: sharedStrings.length - 1, r: ref };
    }));
    
    // 데이터 행
    for (let i = 0; i < glossary.length; i++) {
      const e = glossary[i];
      const rowNum = i + 2;
      const cellRefs = [`A${rowNum}`, `B${rowNum}`, `C${rowNum}`];
      const cells = [];
      [e.source || '', e.target || '', e.type === 'term' ? '자동' : '수동'].forEach((val, j) => {
        sharedStrings.push(val);
        cells.push({ t: 's', v: sharedStrings.length - 1, r: cellRefs[j] });
      });
      rows.push(cells);
    }

    // sharedStrings.xml
    let ssXml = '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + sharedStrings.length + '" uniqueCount="' + sharedStrings.length + '">';
    sharedStrings.forEach(s => {
      ssXml += '<si><t>' + (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</t></si>';
    });
    ssXml += '</sst>';

    // sheet1.xml
    let sheetXml = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      sheetXml += `<row r="${rowIdx + 1}">`;
      for (const cell of rows[rowIdx]) {
        sheetXml += `<c r="${cell.r}" t="${cell.t}"><v>${cell.v}</v></c>`;
      }
      sheetXml += '</row>';
    }
    sheetXml += '</sheetData></worksheet>';

    zip.file('xl/sharedStrings.xml', ssXml);
    zip.file('xl/worksheets/sheet1.xml', sheetXml);
    zip.file('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="용어집" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>');
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>');

    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('용어집.xlsx')}`);
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '엑셀 생성 오류: ' + err.message });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError)
    return res.status(400).json({ error: '파일 업로드 오류: ' + err.message });
  next(err);
});

// Vercel 서버리스에서는 app을 export해 함수로 실행(VERCEL 환경변수 자동 주입).
// 로컬(node server.js)에서는 직접 listen.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`검수 웹앱 실행: http://localhost:${PORT}`);
  });
}
module.exports = app;
