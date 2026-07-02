const sourceFile = document.getElementById('sourceFile');
const targetFile = document.getElementById('targetFile');
const checkBtn = document.getElementById('checkBtn');
const reloadBtn = document.getElementById('reloadBtn');
const glossaryBody = document.querySelector('#glossaryTable tbody');
const resultArea = document.getElementById('resultArea');
const exportBtn = document.getElementById('exportBtn');
const statusEl = document.getElementById('status');

// ---------- 용어집 로드 ----------
async function loadGlossary() {
  try {
    const res = await fetch('/api/glossary');
    const data = await res.json();
    renderGlossary(data);
  } catch (e) {
    showStatus('error', '용어집 로드 실패: ' + e.message);
  }
}
function renderGlossary(data) {
  glossaryBody.innerHTML = '';
  if (!data.entries || data.entries.length === 0) {
    glossaryBody.innerHTML =
      '<tr><td colspan="4">용어집이 비어있습니다. verification 폴더에 .docx를 넣으세요.</td></tr>';
    return;
  }
  for (const e of data.entries) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(e.source)}</td><td>${esc(e.target)}</td>
      <td>${e.type === 'term' ? '자동' : '수동'}</td><td>${esc(e.file || '')}</td>`;
    glossaryBody.appendChild(tr);
  }
}

function containsAny(text, terms) {
  return (terms || []).some((t) => t && contains(text, t));
}

function renderAlignedView(data) {
  const section = document.getElementById('alignedView');
  const tbody = document.querySelector('#alignedTable tbody');
  if (!data.alignedPairs || data.alignedPairs.length === 0) {
    section.classList.add('hidden');
    tbody.innerHTML = '';
    return;
  }

  const glossaryTerms = (data.results || [])
    .filter((r) => r.entry.type === 'term')
    .map((r) => ({
      source: r.entry.source,
      variants: expectedVariants(r.entry.target),
    }));

  tbody.innerHTML = '';
  data.alignedPairs.forEach((pair, idx) => {
    const terms = glossaryTerms.filter((entry) => contains(pair.src, entry.source));
    const sourceHtml = terms.length
      ? markupMany(pair.src, terms.map((e) => e.source))
      : esc(pair.src);

    let targetHtml = esc(pair.tgt);
    if (terms.length) {
      const variants = [...new Set(terms.flatMap((e) => e.variants))].filter(Boolean);
      if (pair.tgt && variants.length) {
        const matched = variants.filter((v) => contains(pair.tgt, v));
        targetHtml = matched.length
          ? markupMany(pair.tgt, matched)
          : `<mark class="missing">${esc(pair.tgt)}</mark>`;
      } else if (!pair.tgt) {
        targetHtml = '<span class="muted2">(대응 번역문 없음)</span>';
      }
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="col-idx">${idx + 1}</td><td>${sourceHtml}</td><td>${targetHtml}</td>`;
    tbody.appendChild(tr);
  });

  section.classList.remove('hidden');
}

reloadBtn.addEventListener('click', loadGlossary);
loadGlossary();

// ---------- 검수 ----------
checkBtn.addEventListener('click', async () => {
  if (!sourceFile.files[0] || !targetFile.files[0]) {
    showStatus('error', '원문과 번역문 .docx 파일을 모두 선택하세요.');
    return;
  }
  if (!/\.docx$/i.test(sourceFile.files[0].name) || !/\.docx$/i.test(targetFile.files[0].name)) {
    showStatus('error', '지원하지 않는 형식입니다. .docx 파일만 업로드할 수 있습니다.');
    return;
  }
  const fd = new FormData();
  fd.append('source', sourceFile.files[0]);
  fd.append('target', targetFile.files[0]);

  showStatus('info', '검수 중...');
  checkBtn.disabled = true;
  try {
    const res = await fetch('/api/check', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) {
      showStatus('error', data.error || '검수 실패');
      return;
    }
    render(data);
  } catch (e) {
    showStatus('error', '서버 통신 오류: ' + e.message);
  } finally {
    checkBtn.disabled = false;
  }
});

const noteBanner = document.getElementById('noteBanner');
let editedTarget = []; // 편집된 번역문 보존

function renderNotes(notes) {
  if (!noteBanner) return;
  if (!notes || notes.length === 0) {
    noteBanner.hidden = true;
    noteBanner.innerHTML = '';
    return;
  }
  noteBanner.hidden = false;
  noteBanner.innerHTML =
    '<b>문서 전체 기준 미준수 (용어 통일 등)</b>' +
    notes
      .map((n) => {
        const v =
          n.violations && n.violations.length
            ? ' — ' + n.violations.map((x) => esc(x.problem || '')).join('; ')
            : '';
        return `<div class="note-item"><b>${esc(n.term)}</b> ${esc(
          n.criterion || ''
        )}${v}</div>`;
      })
      .join('');
}

// 여러 용어를 한 텍스트에서 형광
function markupMany(text, terms) {
  let html = esc(text);
  const uniq = [...new Set((terms || []).filter(Boolean))];
  for (const t of uniq) {
    html = html.replace(new RegExp('(' + escRe(esc(t)) + ')', 'gi'), '<mark>$1</mark>');
  }
  return html;
}

// 기대 번역어 변형(서버 expectedVariants와 동일 규칙)
function expectedVariants(target) {
  return String(target || '')
    .split(/[,/、·]/)
    .map((s) => s.replace(/\([^)]*\)/g, '').trim())
    .filter((s) => s.length >= 2);
}

// 문단에서 해당 용어가 든 문장만 추출(공백 무시 매칭). 없으면 문단 전체.
function sentenceWith(text, terms) {
  const norm = (s) => s.toLowerCase().replace(/\s+/g, '');
  const sents = String(text).split(/(?<=[.?!。])\s+/);
  const hit = sents.filter((s) =>
    (terms || []).some((t) => t && norm(s).includes(norm(t)))
  );
  return (hit.length ? hit.join(' … ') : text).trim();
}

function markupTarget(text, terms) {
  const source = String(text || '');
  const variants = (terms || []).filter(Boolean);
  const matched = variants.filter((v) => contains(source, v));
  if (matched.length) {
    return markupMany(source, matched);
  }
  return `<mark class="missing">${esc(source)}</mark>`;
}

function groupHead(label, title, status) {
  const d = document.createElement('div');
  d.className = 'term-head ' + status;
  d.textContent = `[${label}] ${title}`;
  return d;
}

function labelFor(status) {
  return status === 'fail' ? '미준수' : status === 'warn' ? '부분적용' : '수동검토';
}

// 통일 등 note 기준 + 수동검토 용어 → 상단 배너
function renderNoteBanner(noteFlags, manualTerms) {
  if (!noteBanner) return;
  let html = '';
  if (noteFlags.length)
    html +=
      '<b>문서 전체 기준 (용어 통일 등)</b>' +
      noteFlags
        .map((r) => {
          const v =
            r.violations && r.violations.length
              ? ' — ' + r.violations.map((x) => esc(x.problem || '')).join('; ')
              : '';
          return `<div class="note-item">[${labelFor(r.status)}] <b>${esc(
            r.entry.source
          )}</b> ${esc(r.note || r.entry.target || '')}${v}</div>`;
        })
        .join('');
  if (manualTerms.length)
    html +=
      '<div class="note-item">수동검토(용어집에 자동검사 기대어 미정의): ' +
      manualTerms.map((r) => `${esc(r.entry.source)}(${r.matchCount || 0})`).join(', ') +
      '</div>';
  noteBanner.hidden = !html;
  noteBanner.innerHTML = html;
}

// 편집 가능한 번역문 셀(형광 유지). 입력/blur마다 기대어 재형광.
function buildEditableInto(td, text, hlTerms, highlightMissing) {
  const view = document.createElement('div');
  view.className = 'editable-view';
  view.contentEditable = 'true';
  view.spellcheck = false;
  view.dataset.orig = text; // 원본 보존(수정본 내보내기 diff용)
  let cur = text;
  const rv = () => {
    if (!cur) {
      view.innerHTML = '<span class="muted2">(대응 번역문 없음 — 입력)</span>';
      return;
    }
    if (highlightMissing && (!hlTerms || hlTerms.length === 0)) {
      view.innerHTML = `<mark class="missing">${esc(cur)}</mark>`;
      return;
    }
    view.innerHTML = markupMany(cur, hlTerms);
  };
  rv();
  view.addEventListener('focus', () => {
    if (!cur) view.textContent = '';
  });
  view.addEventListener('input', () => {
    cur = view.textContent;
  });
  view.addEventListener('blur', () => {
    cur = view.textContent;
    rv();
  });
  td.appendChild(view);
}

// 미준수 쌍 한 줄: 원문(좌, 용어 형광) | 번역문(우, 편집, 기대어 형광)
function pairRow(p, term, exVars) {
  const tr = document.createElement('tr');
  const tdS = document.createElement('td');
  tdS.className = 'src-cell needs-fix';
  tdS.innerHTML = markupMany(sentenceWith(p.src, [term]), [term]);
  const tdT = document.createElement('td');
  tdT.className = 'tgt-cell needs-fix';
  const hasMatch = exVars.some((v) => contains(p.tgt || '', v));
  buildEditableInto(tdT, p.tgt || '', exVars, !hasMatch && Boolean(p.tgt));
  tr.append(tdS, tdT);
  return tr;
}

// ---------- 결과 렌더: 미준수 용어별 2열 매칭 표(원문|번역문) ----------
function render(data) {
  resultArea.innerHTML = '';
  renderAlignedView(data);
  const results = data.results || [];
  const termFlags = results.filter(
    (r) => r.entry.type === 'term' && ['fail', 'warn'].includes(r.status)
  );
  const manualTerms = results.filter(
    (r) => r.entry.type === 'term' && r.status === 'manual'
  );
  const noteFlags = results.filter(
    (r) => r.entry.type === 'note' && ['fail', 'warn', 'manual'].includes(r.status)
  );
  renderNoteBanner(noteFlags, manualTerms);

  let total = 0;
  for (const r of termFlags) {
    const term = r.entry.source;
    const expected = r.entry.target;
    const exVars = expectedVariants(expected);
    // 수정 대상 = 기대 번역어 미사용 쌍(ok=false). 상한 없음(전부).
    const bad = (r.pairs || []).filter((p) => !p.ok);
    if (bad.length === 0) continue;
    total += bad.length;

    const group = document.createElement('div');
    group.className = 'term-group';
    group.appendChild(
      groupHead('미준수', `${term} → 기대 번역어: ${expected} (${bad.length}곳)`, 'fail')
    );
    const table = document.createElement('table');
    table.className = 'pair-table';
    table.innerHTML =
      '<thead><tr><th>원문</th><th>번역문 (클릭하여 수정)</th></tr></thead>';
    const tb = document.createElement('tbody');
    bad.forEach((p) => tb.appendChild(pairRow(p, term, exVars)));
    table.appendChild(tb);
    group.appendChild(table);
    resultArea.appendChild(group);
  }

  if (total === 0)
    resultArea.appendChild(plain('✔ 용어집 용어 기준 미준수 없음.'));

  exportBtn.hidden = false; // 검수 완료 → 수정본 다운로드 가능

  showStatus(
    total ? 'error' : 'ok',
    total
      ? `용어집 기준 미준수 ${total}문장 — 좌(원문)·우(번역문) 형광 부분 수정 후 [수정본 다운로드].`
      : '✔ 용어집 용어 기준 미준수 없음.'
  );
}

// ---------- 수정본 다운로드 ----------
// 편집된 번역문 셀(textContent ≠ dataset.orig)을 모아 서버로 보내 .docx 재작성.
exportBtn.addEventListener('click', async () => {
  const views = resultArea.querySelectorAll('.editable-view');
  const edits = [];
  views.forEach((v) => {
    const before = v.dataset.orig || '';
    const after = v.textContent || '';
    if (before !== after && before.trim()) edits.push({ before, after });
  });
  if (edits.length === 0) {
    showStatus('info', '수정된 번역문이 없습니다. 번역문 셀을 수정한 뒤 다시 누르세요.');
    return;
  }
  if (!targetFile.files[0]) {
    showStatus('error', '번역문 파일이 없습니다. 다시 검수하세요.');
    return;
  }
  const fd = new FormData();
  fd.append('target', targetFile.files[0]);
  fd.append('edits', JSON.stringify(edits));

  showStatus('info', `수정본 생성 중... (${edits.length}개 수정 반영)`);
  exportBtn.disabled = true;
  try {
    const res = await fetch('/api/export', { method: 'POST', body: fd });
    if (!res.ok) {
      let msg = '수정본 생성 실패';
      try {
        msg = (await res.json()).error || msg;
      } catch (_) {}
      showStatus('error', msg);
      return;
    }
    const applied = res.headers.get('X-Applied') || '?';
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)/);
    const name = m ? decodeURIComponent(m[1]) : '수정본.docx';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showStatus('ok', `수정본 다운로드 완료 — 용어 ${applied}곳 반영 (${name}).`);
  } catch (e) {
    showStatus('error', '다운로드 오류: ' + e.message);
  } finally {
    exportBtn.disabled = false;
  }
});

function plain(t) {
  const d = document.createElement('div');
  d.className = 'note-line';
  d.textContent = t;
  return d;
}

function showStatus(kind, text) {
  statusEl.className = 'status show ' + kind;
  statusEl.textContent = text;
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function escRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function contains(text, term) {
  if (typeof text !== 'string' || typeof term !== 'string') return false;
  if (/^[\x00-\x7F]+$/.test(term)) {
    const re = new RegExp('(^|[^A-Za-z0-9])' + escRe(term) + '($|[^A-Za-z0-9])', 'i');
    return re.test(text);
  }
  const n = (s) => s.replace(/\s+/g, '').toLowerCase();
  return n(text).includes(n(term));
}
