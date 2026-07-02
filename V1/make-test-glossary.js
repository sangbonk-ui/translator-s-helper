// 다의어 병합(옵션 1) 테스트용 용어집 docx 생성.
// 기존 용어집에 없는 "추가 의미" 행을 넣어 병합 동작 확인.
// 파일명에 "용어집" 포함 → isGlossaryFile 화이트리스트 통과.
const fs = require('fs');
const JSZip = require('jszip');

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function cell(t) {
  return `<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">${esc(
    t
  )}</w:t></w:r></w:p></w:tc>`;
}
function row(a, b) {
  return `<w:tr>${cell(a)}${cell(b)}</w:tr>`;
}
function docXml(rows) {
  const trs = rows.map((r) => row(r[0], r[1])).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body><w:tbl>
<w:tblPr><w:tblW w:w="8000" w:type="dxa"/></w:tblPr>
<w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid>
${trs}
</w:tbl></w:body></w:document>`;
}

async function build(file, rows) {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.folder('_rels').file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.folder('word').file('document.xml', docXml(rows));
  fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }));
  console.log('wrote', file);
}

build('verification/번역준수기준(용어집)_다의어테스트.docx', [
  ['원문 용어', '번역문 용어'], // 헤더(스킵됨)
  ['report', '보고서'], // 기존 report→신고 와 병합 → "신고/보고서"
  ['issue', '사안'], // 기존 issue→발급하다 와 병합 → "발급하다/사안"
]);
