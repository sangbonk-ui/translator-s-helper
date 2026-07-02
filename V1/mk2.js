const fs=require('fs'),JSZip=require('jszip');
function docXml(ps){const b=ps.map(p=>`<w:p><w:r><w:t xml:space="preserve">${p.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</w:t></w:r></w:p>`).join('');return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${b}</w:body></w:document>`;}
async function build(f,ps){const z=new JSZip();z.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);z.folder('_rels').file('.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);z.folder('word').file('document.xml',docXml(ps));fs.writeFileSync(f,await z.generateAsync({type:'nodebuffer'}));}
(async()=>{
await build('fixtures/target_bad.docx',[
 '국경검사소가 항구에서 모든 화물을 검사한다.',
 '도착 전에 안전 및 보안 수입신고를 제출해야 한다.',
 '또한 반입신고 절차도 별도로 존재한다.',
 '새로운 전산화 통관시스템이 운송 이동을 추적한다.',
 '물품은 RoRo 페리로 도착한다.',
]);
console.log('wrote fixtures/target_bad.docx');
})();
