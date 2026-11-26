import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { readDocx } from "@/lib/extract/docx";
import { NOTES_TITLE, readPptx } from "@/lib/extract/pptx";
import {
  CHUNK_CHARS,
  chunkPages,
  hashInput,
  normalizeText,
  pageLabel,
  readableChars,
  splitText,
} from "@/lib/extract/text";
import { VENDOR_VERSIONS } from "@/lib/extract/vendor";
import {
  checkFile,
  cleanName,
  formatBytes,
  matchesFilter,
  MAX_FILE_BYTES,
  photoName,
  renamed,
  sha256,
  storagePath,
} from "@/lib/files/files";

const fixture = (name: string) => readFileSync(join(__dirname, "..", "fixtures", "files", name));
const installed = (pkg: string) =>
  JSON.parse(readFileSync(join(__dirname, "..", "..", "node_modules", pkg, "package.json"), "utf8")).version;

describe("arquivos aceitos", () => {
  it.each([
    ["Aula.pdf", "application/pdf", "pdf"],
    ["Resumo.docx", "", "documento"],
    ["Slides.PPTX", "", "slides"],
    ["IMG_1234.HEIC", "image/heic", "foto"],
    ["lamina.jpg", "image/jpeg", "foto"],
    ["print", "image/png", "foto"],
  ])("%s é aceito como %s", (name, type, kind) => {
    expect(checkFile({ name, type, size: 1000 })).toEqual({ ok: true, kind });
  });

  it("explica os formatos antigos e recusa o resto", () => {
    expect(checkFile({ name: "Velho.doc", type: "application/msword", size: 10 })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("salve como .docx"),
    });
    expect(checkFile({ name: "Velho.ppt", type: "", size: 10 })).toMatchObject({
      reason: expect.stringContaining(".pptx"),
    });
    expect(checkFile({ name: "deck.apkg", type: "", size: 10 })).toMatchObject({ ok: false });
    expect(checkFile({ name: "vazio.pdf", type: "application/pdf", size: 0 })).toMatchObject({ ok: false });
  });

  it("até 25 MB por arquivo, com o tamanho no aviso", () => {
    expect(checkFile({ name: "a.pdf", type: "", size: MAX_FILE_BYTES })).toEqual({ ok: true, kind: "pdf" });
    expect(checkFile({ name: "a.pdf", type: "", size: MAX_FILE_BYTES + 1 })).toEqual({
      ok: false,
      reason: "Tem 25 MB: o limite é de 25 MB por arquivo.",
    });
    expect(checkFile({ name: "a.pdf", type: "", size: 31 * 1024 * 1024 })).toMatchObject({
      reason: "Tem 31 MB: o limite é de 25 MB por arquivo.",
    });
  });

  it("tamanhos em pt-BR", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(380 * 1024)).toBe("380 KB");
    expect(formatBytes(4.2 * 1024 * 1024)).toBe("4,2 MB");
    expect(formatBytes(250 * 1024 * 1024)).toBe("250 MB");
  });

  it("foto com nome genérico ganha a data; as outras guardam o nome", () => {
    const at = new Date(2026, 10, 26, 8, 34);
    expect(photoName("image.jpg", at, "webp")).toBe("Foto 26-11 08h34.webp");
    expect(photoName("IMG_1234.HEIC", at, "jpg")).toBe("Foto 26-11 08h34.jpg");
    expect(photoName("Lâmina tecido ósseo.png", at, "webp")).toBe("Lâmina tecido ósseo.webp");
  });

  it("renomear guarda a extensão e limpa o nome", () => {
    expect(renamed("Slides.pdf", "  Aula 3  ")).toBe("Aula 3.pdf");
    expect(renamed("Slides.pdf", "Aula 3.pdf")).toBe("Aula 3.pdf");
    expect(renamed("Slides.pdf", "   ")).toBe("Slides.pdf");
    expect(cleanName('a/b:c*"d"')).toBe("a b c d");
    expect(renamed("x.pdf", "n".repeat(300))).toHaveLength(200);
  });

  it("Documentos junta Word e slides", () => {
    expect(matchesFilter("slides", "documento")).toBe(true);
    expect(matchesFilter("documento", "documento")).toBe(true);
    expect(matchesFilter("pdf", "documento")).toBe(false);
    expect(matchesFilter("foto", "todos")).toBe(true);
  });

  it("caminho no bucket e SHA-256", async () => {
    expect(storagePath("u", "f")).toBe("u/f");
    expect(await sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("as versões dos leitores são as instaladas (scripts/copy-vendor.mjs)", () => {
    expect(VENDOR_VERSIONS).toEqual({
      pdfjs: installed("pdfjs-dist"),
      tesseract: installed("tesseract.js"),
      tesseractCore: installed("tesseract.js-core"),
      tessdataPor: installed("@tesseract.js-data/por"),
    });
  });
});

describe("texto e trechos", () => {
  it("arruma espaços, linhas em branco e caracteres de controle", () => {
    expect(normalizeText("  Fêmur\t e   tíbia \r\n\n\n\nPatela\u0000­ ")).toBe("Fêmur e tíbia\n\nPatela");
    expect(readableChars("— · 12 ab")).toBe(4);
  });

  it("corta textos longos em fins de parágrafo, sem passar do limite", () => {
    const paragraph = "A célula eucarionte tem núcleo. ".repeat(40).trim();
    const text = Array.from({ length: 10 }, () => paragraph).join("\n\n");
    const parts = splitText(text, 3000);
    expect(parts.length).toBeGreaterThan(3);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(3000);
      expect(part.startsWith("A célula")).toBe(true);
    }
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " "));
  });

  it("um texto sem pausas é cortado no limite", () => {
    const parts = splitText("x".repeat(13_000), CHUNK_CHARS);
    expect(parts.map((p) => p.length)).toEqual([6000, 6000, 1000]);
  });

  it("cada trecho tem uma página só; páginas vazias não viram trecho", () => {
    const chunks = chunkPages([
      { page: 1, text: "Capa" },
      { page: 2, text: "  " },
      { page: 3, text: "y ".repeat(4000) },
    ]);
    expect(chunks.map((c) => [c.position, c.page])).toEqual([
      [0, 1],
      [1, 3],
      [2, 3],
    ]);
    expect(hashInput(chunks.slice(0, 1))).toBe("[1]\nCapa");
  });

  it("rótulo da página por tipo", () => {
    expect(pageLabel(3, { kind: "pdf", approx: false })).toBe("Página 3");
    expect(pageLabel(3, { kind: "slides", approx: false })).toBe("Slide 3");
    expect(pageLabel(2, { kind: "documento", approx: true })).toBe("Pág. ≈2");
    expect(pageLabel(1, { kind: "foto", approx: false })).toBe("Foto");
  });
});

describe("Word (.docx)", () => {
  it("usa as marcas de página que o Word salvou", async () => {
    const reading = await readDocx(fixture("bioquimica-word.docx"));
    expect(reading.pagesApprox).toBe(false);
    expect(reading.pages.map((p) => p.page)).toEqual([1, 2, 3]);
    const [one, two, three] = reading.pages.map((p) => p.text);
    expect(one).toContain("Resumo de Bioquímica");
    expect(one).toContain("A glicólise ocorre no citoplasma e");
    expect(one).not.toContain("piruvato");
    expect(one).not.toContain("Texto apagado");
    expect(two).toMatch(/^produz piruvato\./);
    expect(two).toContain("O ciclo de Krebs acontece na mitocôndria.");
    expect(two).toContain("Lipídios\nReserva de energia");
    expect(three).toContain("As proteínas são formadas por aminoácidos.");
    expect(three.match(/ligação peptídica/g)).toHaveLength(1);
  });

  it("sem marcas, divide em blocos aproximados, tantos quanto as páginas declaradas", async () => {
    const reading = await readDocx(fixture("membrana-sem-marcas.docx"));
    expect(reading.pagesApprox).toBe(true);
    expect(reading.pages).toHaveLength(2);
    expect(reading.pages[0].text).toMatch(/^Parágrafo 1\./);
    expect(reading.pages[1].text).toContain("Parágrafo 12.");
    expect(reading.pages[1].text).not.toContain("Parágrafo 1.");
  });
});

/** A .docx with only document.xml: no page marks and no page count. */
async function bareDocx(paragraphs: string[]): Promise<ArrayBuffer> {
  const zip = new JSZip();
  const body = paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join("");
  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("Word sem marcas nem contagem de páginas", () => {
  it("texto curto é uma página só, exata", async () => {
    const reading = await readDocx(await bareDocx(["Hemácias transportam oxigênio."]));
    expect(reading).toMatchObject({ pageCount: 1, pagesApprox: false });
  });

  it("texto longo vira blocos de ~3.000 caracteres, aproximados", async () => {
    const long = (n: number) => `Bloco ${n}. ${"Leucócitos defendem o organismo. ".repeat(60)}`;
    const reading = await readDocx(await bareDocx([long(1), long(2), long(3)]));
    expect(reading.pagesApprox).toBe(true);
    expect(reading.pages.map((p) => p.text.slice(0, 8))).toEqual(["Bloco 1.", "Bloco 2.", "Bloco 3."]);
  });
});

describe("Slides (.pptx)", () => {
  it("segue a ordem da apresentação e junta as notas do apresentador", async () => {
    const reading = await readPptx(fixture("imunologia-aula.pptx"));
    expect(reading.pageCount).toBe(3);
    expect(reading.pages.map((p) => p.text)).toEqual([
      "Imunologia · Aula 2\nImunidade inata e adaptativa",
      `Imunidade inata\nBarreiras físicas\nFagócitos e inflamação\n\n${NOTES_TITLE}\nLembrar: a febre também é defesa inata.`,
      "Imunidade adaptativa\nLinfócitos B produzem anticorpos\nLinfócitos T coordenam a resposta",
    ]);
  });
});
