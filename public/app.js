const sourceFile = document.getElementById('sourceFile');
const targetFile = document.getElementById('targetFile');
const checkBtn = document.getElementById('checkBtn');
const reloadBtn = document.getElementById('reloadBtn');
const glossaryBody = document.querySelector('#glossaryTable tbody');
const resultArea = document.getElementById('resultArea');
const exportBtn = document.getElementById('exportBtn');
const statusEl = document.getElementById('status');

// 검수 순회 상태
let reviewList = [];
let reviewIndex = -1;
const reviewToolbar = document.getElementById('reviewToolbar');
const prevBtn = document.getElementById('prevReview');
const nextBtn = document.getElementById('nextReview');
const acceptBtn = document.getElementById('acceptReview');
const reviewCount = document.getElementById('reviewCount');

function updateReviewToolbar() {
  if (!reviewToolbar) return;
  if (!reviewList || reviewList.length === 0) {
    reviewToolbar.classList.add('hidden');
    reviewCount.textContent = '';
    return;
  }
  reviewToolbar.classList.remove('hidden');
  reviewCount.textContent = `${reviewIndex + 1} / ${reviewList.length}`;
}

function clearReviewFocus() {
  reviewList.forEach((tr) => tr.classList.remove('review-focus'));
}

function focusReview(i, scroll = true) {
  if (!reviewList || reviewList.length === 0) return;
  reviewIndex = ((i % reviewList.length) + reviewList.length) % reviewList.length;
  const tr = reviewList[reviewIndex];
  if (!tr) return;
  clearReviewFocus();
  if (scroll) tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
  tr.classList.add('review-focus');
  updateReviewToolbar();
}

prevBtn && prevBtn.addEventListener('click', () => {
  if (!reviewList.length) return;
  focusReview(reviewIndex - 1, true);
});
nextBtn && nextBtn.addEventListener('click', () => {
  if (!reviewList.length) return;
  focusReview(reviewIndex + 1, true);
});

function acceptReviewRow(tr, options = {}) {
  const { scrollAfter = false } = options;
  if (!tr || tr.dataset.accepted === 'true') return;
  if (document.activeElement && document.activeElement.classList.contains('editable-view')) {
    document.activeElement.blur();
  }
  refreshPairRowHighlight(tr);
  tr.dataset.accepted = 'true';
  tr.querySelectorAll('.needs-fix').forEach((el) => el.classList.remove('needs-fix'));
  tr.classList.add('accepted');

  const idx = reviewList.indexOf(tr);
  if (idx >= 0) {
    reviewList.splice(idx, 1);
    if (reviewIndex >= reviewList.length) reviewIndex = reviewList.length - 1;
  }
  if (reviewList.length === 0) {
    reviewIndex = -1;
    clearReviewFocus();
  } else {
    if (reviewIndex < 0) reviewIndex = 0;
    focusReview(reviewIndex, scrollAfter);
  }
  updateReviewToolbar();
}

acceptBtn && acceptBtn.addEventListener('click', () => {
  if (reviewIndex < 0 || !reviewList[reviewIndex]) return;
  acceptReviewRow(reviewList[reviewIndex]);
});

// ---------- 용어집 로드 및 렌더 ----------
const addGlossaryRowBtn = document.getElementById('addGlossaryRow');
const exportGlossaryBtn = document.getElementById('exportGlossary');
const saveGlossaryBtn = document.getElementById('saveGlossary');
let glossaryData = [];

function loadSavedGlossaryFromLocalStorage() {
  try {
    const raw = localStorage.getItem('savedGlossary');
    if (!raw) return [];
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return [];
    return saved.filter((e) => e && (e.source || e.target));
  } catch (e) {
    console.warn('로컬 저장 용어집 로드 실패', e);
    return [];
  }
}

function overlaySavedGlossary(entries) {
  const saved = loadSavedGlossaryFromLocalStorage();
  if (!saved.length) return entries;
  const byKey = new Map(entries.map((e) => [String(e.source || '').toLowerCase(), { ...e }]));
  for (const entry of saved) {
    const key = String(entry.source || '').toLowerCase();
    if (!key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, { ...entry });
      continue;
    }
    const current = byKey.get(key);
    current.target = entry.target || current.target;
    current.type = entry.type || current.type;
  }
  return [...byKey.values()];
}

async function loadGlossary() {
  try {
    const res = await fetch('/api/glossary');
    const data = await res.json();
    const serverEntries = data.entries || [];
    glossaryData = overlaySavedGlossary(serverEntries);
    renderGlossary({ entries: glossaryData });
  } catch (e) {
    showStatus('error', '용어집 로드 실패: ' + e.message);
  }
}

function renderGlossary(data) {
  glossaryBody.innerHTML = '';
  if (!glossaryData || glossaryData.length === 0) {
    glossaryBody.innerHTML =
      '<tr><td colspan="4">용어집이 비어있습니다. verification 폴더에 .docx를 넣으세요.</td></tr>';
    return;
  }
  for (let i = 0; i < glossaryData.length; i++) {
    const e = glossaryData[i];
    const tr = document.createElement('tr');
    tr.dataset.index = i;
    const srcInput = document.createElement('input');
    srcInput.type = 'text';
    srcInput.className = 'glossary-cell';
    srcInput.dataset.field = 'source';
    srcInput.value = e.source || '';
    
    const tgtInput = document.createElement('input');
    tgtInput.type = 'text';
    tgtInput.className = 'glossary-cell';
    tgtInput.dataset.field = 'target';
    tgtInput.value = e.target || '';
    
    const typeSelect = document.createElement('select');
    typeSelect.className = 'glossary-cell';
    typeSelect.dataset.field = 'type';
    typeSelect.innerHTML = '<option value="term">자동</option><option value="note">수동</option>';
    typeSelect.value = e.type || 'term';
    
    const delBtn = document.createElement('button');
    delBtn.className = 'del-glossary-btn secondary';
    delBtn.textContent = '삭제';
    delBtn.dataset.index = i;
    
    const td1 = document.createElement('td');
    td1.appendChild(srcInput);
    const td2 = document.createElement('td');
    td2.appendChild(tgtInput);
    const td3 = document.createElement('td');
    td3.appendChild(typeSelect);
    const td4 = document.createElement('td');
    td4.appendChild(delBtn);
    
    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tr.appendChild(td4);
    glossaryBody.appendChild(tr);
  }
  attachGlossaryListeners();
}

function syncGlossaryDataFromDom() {
  const rows = Array.from(glossaryBody.querySelectorAll('tr'));
  const updated = rows.map((tr) => {
    const source = tr.querySelector('input[data-field="source"]')?.value || '';
    const target = tr.querySelector('input[data-field="target"]')?.value || '';
    const type = tr.querySelector('select[data-field="type"]')?.value || 'term';
    return { source, target, type };
  });
  glossaryData = updated.filter((e) => e.source.trim() || e.target.trim());
}

function attachGlossaryListeners() {
  glossaryBody.querySelectorAll('.glossary-cell').forEach((cell) => {
    cell.addEventListener('change', (e) => {
      const tr = e.target.closest('tr');
      const idx = parseInt(tr.dataset.index, 10);
      const field = e.target.dataset.field;
      if (glossaryData[idx]) glossaryData[idx][field] = e.target.value;
    });
  });
  glossaryBody.querySelectorAll('.del-glossary-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      glossaryData.splice(idx, 1);
      renderGlossary({});
    });
  });
}

addGlossaryRowBtn && addGlossaryRowBtn.addEventListener('click', () => {
  glossaryData.push({ source: '', target: '', type: 'term', file: '' });
  renderGlossary({});
});

exportGlossaryBtn && exportGlossaryBtn.addEventListener('click', async () => {
  if (!glossaryData || glossaryData.length === 0) {
    showStatus('info', '내보낼 용어가 없습니다.');
    return;
  }
  try {
    exportGlossaryBtn.disabled = true;
    const res = await fetch('/api/export-glossary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ glossary: glossaryData })
    });
    if (!res.ok) {
      showStatus('error', '용어집 내보내기 실패');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '용어집.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showStatus('ok', '용어집 다운로드 완료.');
  } catch (e) {
    showStatus('error', '다운로드 여류: ' + e.message);
  } finally {
    exportGlossaryBtn.disabled = false;
  }
});

saveGlossaryBtn && saveGlossaryBtn.addEventListener('click', async () => {
  syncGlossaryDataFromDom();
  if (!glossaryData || glossaryData.length === 0) {
    showStatus('info', '저장할 용어집이 없습니다.');
    return;
  }
  try {
    saveGlossaryBtn.disabled = true;
    // 편집분은 브라우저 localStorage에만 영구 저장 (Vercel 서버리스는 디스크 쓰기 불가).
    // 검수 시 performCheck가 glossaryData를 서버로 전송하므로 서버 저장 불필요.
    localStorage.setItem('savedGlossary', JSON.stringify(glossaryData));
    showStatus('ok', '용어집 저장 완료 (이 브라우저에 저장됨).');
    await loadGlossary();
    if (sourceFile.files[0] && targetFile.files[0]) {
      showStatus('info', '저장된 용어집으로 다시 검수합니다...');
      await performCheck();
    }
  } catch (e) {
    showStatus('error', '저장 오류: ' + e.message);
  } finally {
    saveGlossaryBtn.disabled = false;
  }
});

function containsAny(text, terms) {
  return (terms || []).some((t) => t && contains(text, t));
}

reloadBtn.addEventListener('click', loadGlossary);
loadGlossary();

// 용어집 접기/펼치기 토글
const toggleBtn = document.getElementById('toggleGlossary');
const glossaryContainer = document.getElementById('glossaryContainer');
let glossaryOpen = false;

function setGlossaryVisibility(open) {
  glossaryOpen = open;
  if (open) {
    glossaryContainer.classList.remove('collapsed');
    toggleBtn.textContent = '▼ 번역 준수 기준 — 용어집';
  } else {
    glossaryContainer.classList.add('collapsed');
    toggleBtn.textContent = '▶ 번역 준수 기준 — 용어집';
  }
}

toggleBtn.addEventListener('click', () => {
  setGlossaryVisibility(!glossaryOpen);
});

// 초기: 용어집 접혀있음
setGlossaryVisibility(false);

// ---------- 검수 ----------
async function performCheck() {
  if (!sourceFile.files[0] || !targetFile.files[0]) {
    showStatus('error', '원문과 번역문 .docx 파일을 모두 선택하세요.');
    return false;
  }
  if (!/\.docx$/i.test(sourceFile.files[0].name) || !/\.docx$/i.test(targetFile.files[0].name)) {
    showStatus('error', '지원하지 않는 형식입니다. .docx 파일만 업로드할 수 있습니다.');
    return false;
  }
  const fd = new FormData();
  fd.append('source', sourceFile.files[0]);
  fd.append('target', targetFile.files[0]);
  if (glossaryData && glossaryData.length) {
    fd.append('glossary', JSON.stringify(glossaryData));
  }

  showStatus('info', '검수 중...');
  checkBtn.disabled = true;
  try {
    const res = await fetch('/api/check', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) {
      showStatus('error', data.error || '검수 실패');
      return false;
    }
    render(data);
    return true;
  } catch (e) {
    showStatus('error', '서버 통신 오류: ' + e.message);
    return false;
  } finally {
    checkBtn.disabled = false;
  }
}

checkBtn.addEventListener('click', performCheck);

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

function buildTermStatRow(stCount, ttCount) {
  const wrap = document.createElement('div');
  wrap.className = 'term-stat-row';

  wrap.innerHTML = `
    <div class="term-stat-note">처음에는 자동으로 계산된 값이 표시됩니다. 번역가가 최종 검수 후 값이 확정되면 아래 셀을 직접 수정하면 됩니다.</div>
    <table class="term-stat-table">
      <thead>
        <tr>
          <th>미준수율(%)</th>
          <th>ST 사용 갯수</th>
          <th>TT 미준수 갯수</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><input type="text" class="term-stat-cell term-rate" readonly /></td>
          <td><input type="number" class="term-stat-cell term-st" min="0" /></td>
          <td><input type="number" class="term-stat-cell term-tt" min="0" /></td>
        </tr>
      </tbody>
    </table>
  `;

  const pctInput = wrap.querySelector('.term-rate');
  const stInput = wrap.querySelector('.term-st');
  const ttInput = wrap.querySelector('.term-tt');

  const recalc = () => {
    const st = Number(stInput.value || 0);
    const tt = Number(ttInput.value || 0);
    const pct = st > 0 ? ((tt / st) * 100).toFixed(1) : '0.0';
    pctInput.value = pct;
  };

  const sync = () => {
    if (Number(stInput.value) < 0) stInput.value = '0';
    if (Number(ttInput.value) < 0) ttInput.value = '0';
    recalc();
  };

  stInput.value = stCount != null ? stCount : 0;
  ttInput.value = ttCount != null ? ttCount : 0;
  stInput.addEventListener('input', sync);
  ttInput.addEventListener('input', sync);
  recalc();
  return wrap;
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

function refreshPairRowHighlight(tr) {
  const view = tr.querySelector('.editable-view');
  const expected = JSON.parse(tr.dataset.expectedVariants || '[]');
  const sourceTerm = tr.dataset.sourceTerm || '';
  if (!view) return;
  const text = view.textContent || '';
  if (!text.trim()) {
    view.innerHTML = '<span class="muted2">(대응 번역문 없음 — 입력)</span>';
    return;
  }
  const highlightTerms = [...expected];
  if (sourceTerm && sourceTerm.length >= 2 && contains(text, sourceTerm)) {
    highlightTerms.push(sourceTerm);
  }
  if (highlightTerms.length && highlightTerms.some((term) => contains(text, term))) {
    view.innerHTML = markupMany(text, [...new Set(highlightTerms)]);
  } else {
    view.innerHTML = esc(text);
  }
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
  tr.dataset.expectedVariants = JSON.stringify(exVars);
  tr.dataset.sourceTerm = term || '';
  // 제외 버튼: 이 행은 검수 대상에서 화면상 제거
  const exBtn = document.createElement('button');
  exBtn.type = 'button';
  exBtn.className = 'exclude-btn secondary';
  exBtn.textContent = '제외';
  exBtn.title = '이 항목을 검수 대상에서 제외합니다';
  exBtn.addEventListener('click', () => {
    tr.dataset.excluded = 'true';
    const idx = reviewList.indexOf(tr);
    tr.remove();
    buildReviewList(idx, false);
  });

  const reviewCtrl = document.createElement('div');
  reviewCtrl.className = 'row-review-controls';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'secondary';
  prevBtn.textContent = '이전';
  prevBtn.addEventListener('click', () => focusReview(reviewList.indexOf(tr) - 1, false));
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'secondary';
  nextBtn.textContent = '다음';
  nextBtn.addEventListener('click', () => focusReview(reviewList.indexOf(tr) + 1, false));
  const acceptBtnRow = document.createElement('button');
  acceptBtnRow.type = 'button';
  acceptBtnRow.className = 'secondary';
  acceptBtnRow.textContent = '준수';
  acceptBtnRow.addEventListener('click', () => acceptReviewRow(tr, { scrollAfter: false }));
  reviewCtrl.append(prevBtn, nextBtn, acceptBtnRow, exBtn);

  const ctrlWrap = document.createElement('div');
  ctrlWrap.style.marginTop = '8px';
  ctrlWrap.appendChild(reviewCtrl);
  tdT.appendChild(ctrlWrap);
  tr.append(tdS, tdT);
  return tr;
}

// ---------- 결과 렌더: 미준수 용어별 2열 매칭 표(원문|번역문) ----------
function render(data) {
  resultArea.innerHTML = '';
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
    const statRow = buildTermStatRow(r.matchCount || bad.length, bad.length);
    group.appendChild(statRow);
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

  // 문체(평서체/경어체) 검토 화면 — 용어집 결과 하단에 렌더
  renderStyle(data.style);

  // build review list for navigation
  buildReviewList();

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

// ---------- 문체(평서체/경어체) 검토 렌더 ----------
const styleSection = document.getElementById('styleSection');
const styleSummary = document.getElementById('styleSummary');
const styleArea = document.getElementById('styleArea');

const STYLE_LABEL = { plain: '평서체', honorific: '경어체', review: '검토대상' };

function renderStyle(style) {
  if (!styleSection || !styleSummary || !styleArea) return;
  styleSummary.innerHTML = '';
  styleArea.innerHTML = '';
  if (!style || !style.items) {
    styleSection.hidden = true;
    return;
  }
  styleSection.hidden = false;

  const s = style.summary || {};
  const domLabel = s.dominant && STYLE_LABEL[s.dominant] ? STYLE_LABEL[s.dominant] : '없음';

  // 요약: 분류 집계 + 주문체 + 혼용 경고
  let summaryHtml =
    `<div class="style-counts">` +
    `<span class="style-chip plain">평서체 ${s.plain || 0}</span>` +
    `<span class="style-chip honorific">경어체 ${s.honorific || 0}</span>` +
    `<span class="style-chip review">검토대상 ${s.review || 0}</span>` +
    `<span class="style-chip total">전체 ${s.total || 0}문장</span>` +
    `</div>` +
    `<div class="style-dominant">주 문체: <b>${domLabel}</b>` +
    (s.excluded
      ? ` <span class="style-excluded">(검토 제외 ${s.excluded}문장: 원문·영어/숫자, 명사·명사형 종결)</span>`
      : '') +
    `</div>`;
  if (s.mixed)
    summaryHtml +=
      `<div class="style-warn">⚠ 평서체·경어체가 혼용되어 있습니다. 한 가지 문체로 통일이 필요합니다 (주 문체: ${domLabel}).</div>`;
  styleSummary.innerHTML = summaryHtml;

  // 주의 필요 문장: 검토대상 + (혼용 시) 주 문체와 다른 문체 문장
  const flagged = style.items.filter((it) => {
    if (it.style === 'review') return true;
    if (s.mixed && it.style !== s.dominant) return true;
    return false;
  });

  if (flagged.length === 0) {
    styleArea.appendChild(plain('✔ 문체 기준 미준수/검토대상 문장 없음.'));
    return;
  }

  const table = document.createElement('table');
  table.className = 'style-table';
  table.innerHTML =
    '<thead><tr><th>문단#</th><th>번역문 문장</th><th>분류</th><th>사유</th></tr></thead>';
  const tb = document.createElement('tbody');
  flagged.forEach((it) => {
    const tr = document.createElement('tr');
    tr.className = 'style-row ' + it.style;
    const reason =
      it.style === 'review'
        ? '종결어 자동 분류 불가 — 번역가 검토/수정'
        : `주 문체(${STYLE_LABEL[s.dominant]})와 다른 ${STYLE_LABEL[it.style]} — 통일 검토`;
    tr.innerHTML =
      `<td class="style-pidx">${(it.paraIndex ?? 0) + 1}</td>` +
      `<td class="style-sent">${esc(it.text)}</td>` +
      `<td class="style-cls"><span class="style-chip ${it.style}">${STYLE_LABEL[it.style] || it.style}</span></td>` +
      `<td class="style-reason">${esc(reason)}</td>`;
    tb.appendChild(tr);
  });
  table.appendChild(tb);
  styleArea.appendChild(table);
}

function buildReviewList(preferredIndex = null, scroll = true) {
  // collect all pair-table rows that are still needs-fix and not accepted
  const rows = Array.from(resultArea.querySelectorAll('.pair-table tbody tr'));
  reviewList = rows.filter((tr) => !tr.dataset.accepted && tr.querySelector('.needs-fix'));
  if (preferredIndex != null && preferredIndex >= 0 && preferredIndex < reviewList.length) {
    reviewIndex = preferredIndex;
  } else if (reviewIndex >= 0 && reviewIndex < reviewList.length) {
    reviewIndex = reviewIndex;
  } else {
    reviewIndex = reviewList.length ? 0 : -1;
  }
  updateReviewToolbar();
  if (reviewIndex >= 0) focusReview(reviewIndex, scroll);
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
