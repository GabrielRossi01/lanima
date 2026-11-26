// Builds the sample files of the extraction tests (tests/fixtures/files). The texts were written
// for this project (no copyright). Run again only to change them: node scripts/make-fixtures.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "tests", "fixtures", "files");
mkdirSync(out, { recursive: true });
const save = (name, data) => writeFileSync(join(out, name), data);
const FIXED = new Date("2026-11-26T12:00:00Z");

// --- PDF of slides: 3 pages of text, the middle one empty except for a title ------------------
async function slidesPdf() {
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(FIXED);
  pdf.setModificationDate(FIXED);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const slides = [
    ["Aula 07 · Esqueleto axial", ["O esqueleto axial tem 80 ossos.", "Crânio, coluna vertebral, costelas e esterno."]],
    [
      "Coluna vertebral",
      ["São 7 vértebras cervicais, 12 torácicas e 5 lombares.", "O sacro e o cóccix fecham a coluna."],
    ],
    [
      "Caixa torácica",
      ["As costelas verdadeiras se ligam direto ao esterno.", "As falsas e as flutuantes completam os 12 pares."],
    ],
  ];
  for (const [title, lines] of slides) {
    const page = pdf.addPage([960, 540]);
    page.drawText(title, { x: 60, y: 450, size: 36, font: bold });
    lines.forEach((line, i) => page.drawText(line, { x: 60, y: 360 - i * 48, size: 26, font }));
  }
  save("anatomia-slides.pdf", await pdf.save({ useObjectStreams: false }));
}

// --- Photo of a book page: text drawn as an image -----------------------------------------------
const BOOK_LINES = [
  "Capítulo 4 · Enzimas",
  "",
  "As enzimas são proteínas que aceleram",
  "as reações químicas da célula sem serem",
  "consumidas. Cada enzima reconhece um",
  "substrato específico no sítio ativo.",
  "A temperatura e o pH alteram a sua",
  "atividade, e a desnaturação a interrompe.",
];
async function bookPhoto() {
  const lines = BOOK_LINES.map(
    (line, i) =>
      `<text x="70" y="${120 + i * 62}" font-family="Georgia, 'Times New Roman', serif" font-size="${i === 0 ? 44 : 36}" ${i === 0 ? 'font-weight="bold"' : ""} fill="#1d1a16">${line}</text>`,
  ).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="680"><rect width="100%" height="100%" fill="#f4efe4"/>${lines}</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  save("livro-pagina.png", png);
  return png;
}

// --- Scanned PDF: page 1 has text, page 2 is only the picture of the book page ------------------
async function scannedPdf(png) {
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(FIXED);
  pdf.setModificationDate(FIXED);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const first = pdf.addPage([595, 842]);
  first.drawText("Apostila de Bioquímica · Parte 1", { x: 50, y: 760, size: 22, font });
  first.drawText("A próxima página foi digitalizada de um livro.", { x: 50, y: 720, size: 14, font });
  const image = await pdf.embedPng(png);
  const second = pdf.addPage([595, 842]);
  second.drawImage(image, { x: 20, y: 400, width: 555, height: 377 });
  save("bioquimica-escaneada.pdf", await pdf.save({ useObjectStreams: false }));
}

// --- Word ----------------------------------------------------------------------------------------
const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const run = (text, extra = "") => `<w:r>${extra}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (inner, props = "") => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${inner}</w:p>`;

async function docx(name, bodyXml, appXml) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${appXml ? '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' : ""}</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W_NS}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><w:body>${bodyXml}<w:sectPr/></w:body></w:document>`,
  );
  if (appXml) zip.file("docProps/app.xml", appXml);
  save(name, await zip.generateAsync({ type: "nodebuffer", date: FIXED }));
}

async function wordFiles() {
  // Saved by Word: page marks where pages 2 and 3 started, a hard break, a deleted run, a text box
  // with its VML copy (mc:Fallback) and a table.
  await docx(
    "bioquimica-word.docx",
    [
      para(run("Resumo de Bioquímica"), '<w:pStyle w:val="Title"/>'),
      para(
        run("Os carboidratos são a principal fonte de energia.") +
          `<w:del><w:r><w:delText>Texto apagado.</w:delText></w:r></w:del>`,
      ),
      para(
        run("A glicólise ocorre no citoplasma e") +
          `<w:r><w:lastRenderedPageBreak/><w:t xml:space="preserve"> produz piruvato.</w:t></w:r>`,
      ),
      para(run("O ciclo de Krebs acontece na mitocôndria.")),
      `<w:tbl><w:tr><w:tc>${para(run("Lipídios"))}</w:tc><w:tc>${para(run("Reserva de energia"))}</w:tc></w:tr></w:tbl>`,
      para(run("", '<w:br w:type="page"/>')),
      para(`<w:r><w:lastRenderedPageBreak/><w:t>As proteínas são formadas por aminoácidos.</w:t></w:r>`),
      para(
        `<mc:AlternateContent><mc:Choice Requires="wps"><w:r><w:t>Quadro: ligação peptídica.</w:t></w:r></mc:Choice><mc:Fallback><w:r><w:t>Quadro: ligação peptídica.</w:t></w:r></mc:Fallback></mc:AlternateContent>`,
      ),
    ].join(""),
  );
  // Exported without page marks: a long text that the file says has 2 pages.
  const long = Array.from({ length: 12 }, (_, i) =>
    para(
      run(
        `Parágrafo ${i + 1}. A membrana plasmática controla a entrada e a saída de substâncias da célula, com proteínas de transporte e canais iônicos.`,
      ),
    ),
  ).join("");
  await docx(
    "membrana-sem-marcas.docx",
    long,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Pages>2</Pages></Properties>`,
  );
}

// --- PowerPoint: 3 slides, listed in an order different from the file names --------------------
const P_NS = `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
const shape = (texts, ph = "") =>
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:txBody>${texts.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sp>`;
const slideXml = (shapes) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${P_NS}><p:cSld><p:spTree>${shapes}</p:spTree></p:cSld></p:sld>`;

async function pptx() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
  );
  // Order: slide3.xml, slide1.xml, slide2.xml.
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ${P_NS}><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId1"/><p:sldId id="258" r:id="rId2"/></p:sldIdLst></p:presentation>`,
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide3.xml"/></Relationships>`,
  );
  const number = shape(["99"], '<p:ph type="sldNum"/>');
  zip.file(
    "ppt/slides/slide3.xml",
    slideXml(shape(["Imunologia · Aula 2"], '<p:ph type="title"/>') + shape(["Imunidade inata e adaptativa"]) + number),
  );
  zip.file(
    "ppt/slides/slide1.xml",
    slideXml(
      shape(["Imunidade inata"], '<p:ph type="title"/>') +
        shape(["Barreiras físicas", "Fagócitos e inflamação"]) +
        number,
    ),
  );
  zip.file(
    "ppt/slides/slide2.xml",
    slideXml(
      shape(["Imunidade adaptativa"], '<p:ph type="title"/>') +
        shape(["Linfócitos B produzem anticorpos", "Linfócitos T coordenam a resposta"]),
    ),
  );
  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>`,
  );
  zip.file(
    "ppt/notesSlides/notesSlide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes ${P_NS}><p:cSld><p:spTree>${shape(["imagem"], '<p:ph type="sldImg"/>')}${shape(["Lembrar: a febre também é defesa inata."], '<p:ph type="body" idx="1"/>')}${shape(["2"], '<p:ph type="sldNum"/>')}</p:spTree></p:cSld></p:notes>`,
  );
  save("imunologia-aula.pptx", await zip.generateAsync({ type: "nodebuffer", date: FIXED }));
}

await slidesPdf();
const png = await bookPhoto();
await scannedPdf(png);
await wordFiles();
await pptx();
console.log("fixtures em", out, readFileSync(join(out, "livro-pagina.png")).length, "bytes de foto");
