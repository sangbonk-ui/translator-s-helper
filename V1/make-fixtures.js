// 테스트용 .docx 픽스처 생성 (검수 동작 확인용)
const fs = require('fs');
const JSZip = require('jszip');

function docXml(paras) {
  const body = paras
    .map(
      (p) =>
        `<w:p><w:r><w:t xml:space="preserve">${p
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</w:t></w:r></w:p>`
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}</w:body></w:document>`;
}

async function build(file, paras) {
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
  zip.folder('word').file('document.xml', docXml(paras));
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(file, buf);
  console.log('wrote', file);
}

(async () => {
  await build('fixtures/source.docx', [
    'Border Force inspects all cargo at the port.', // Border Force
    'The ENS must be submitted before arrival.', // ENS (note)
    'The NCTS tracks the transit movement.', // NCTS (note)
    'Goods arrive by RoRo ferry.', // RoRo (note)
    'This sentence has no glossary term.',
  ]);
  await build('fixtures/target.docx', [
    '국경검사소가 항구에서 모든 화물을 검사한다.', // 국경검사소 포함 → Border Force pass
    '도착 전에 안전 및 보안 수입신고를 제출해야 한다.', // ENS 번역, 한글표기
    '새로운 전산화 통관시스템이 운송 이동을 추적한다.', // NCTS 번역
    '물품은 RoRo 페리로 도착한다.', // RoRo 그대로 → 우리말 번역 필요(수동검토, 번역문에 RoRo 발견)
    '이 문장에는 용어집 용어가 없다.',
  ]);
  // 통일검사 fail 회귀 픽스처: ENS를 2가지 변형으로 혼용 → 규칙 기반 fail
  await build('fixtures/target_bad.docx', [
    '국경검사소가 항구에서 모든 화물을 검사한다.',
    '도착 전에 안전 및 보안 수입신고를 제출해야 한다.', // ENS 변형1
    '또한 반입신고 절차도 별도로 존재한다.', // ENS 변형2 → 2종 혼용 = fail
    '새로운 전산화 통관시스템이 운송 이동을 추적한다.', // NCTS 1종 → pass
    '물품은 RoRo 페리로 도착한다.',
  ]);
})();
