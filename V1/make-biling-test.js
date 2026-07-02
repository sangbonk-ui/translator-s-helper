const fs=require('fs'),JSZip=require('jszip');
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function par(t){return `<w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;}
function cell(ps){return `<w:tc><w:tcPr><w:tcW w:w="5000" w:type="dxa"/></w:tcPr>${ps.map(par).join('')}</w:tc>`;}
function row(cells){return `<w:tr>${cells.map(cell).join('')}</w:tr>`;}
function doc(rows){return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl>
<w:tblPr><w:tblW w:w="10000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="5000"/></w:tblGrid>
${rows.map(row).join('')}</w:tbl></w:body></w:document>`;}
async function build(f,rows){const z=new JSZip();
z.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
z.folder('_rels').file('.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
z.folder('word').file('document.xml',doc(rows));
fs.writeFileSync(f,await z.generateAsync({type:'nodebuffer'}));console.log('wrote',f);}
build('fixtures/biling_test.docx',[
 [['It authorizes the establishment of standards for protection.','보호 기준의 수립을 승인한다.']], // establishment→수립: 미준수(용어집 작업장/설립)
 [['Border Force inspects all cargo.','관할기관이 모든 화물을 검사한다.']], // Border Force 오역: 미준수
 [['The official veterinarian signs the certificate.','정부수의사가 증명서에 서명한다.']], // official veterinarian→정부수의사: 준수(pass)
]);
