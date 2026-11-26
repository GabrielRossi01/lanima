// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createOcr } from "@/lib/extract/ocr";
import { joinTextItems, readPdf, type ReadProgress } from "@/lib/extract/pdf";

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, "..", "fixtures", "files", name)));
const modules = join(__dirname, "..", "..", "node_modules");
const lib = pdfjs as unknown as Parameters<typeof readPdf>[1]["lib"];
const params = { standardFontDataUrl: join(modules, "pdfjs-dist", "standard_fonts") + "/" };

describe("PDF", () => {
  it("lê o texto de cada página, com o número certo", async () => {
    const reading = await readPdf(fixture("anatomia-slides.pdf"), { lib, params });
    expect(reading).toMatchObject({ pageCount: 3, pagesApprox: false, usedOcr: false });
    expect(reading.pages).toEqual([
      {
        page: 1,
        text: "Aula 07 · Esqueleto axial\nO esqueleto axial tem 80 ossos.\nCrânio, coluna vertebral, costelas e esterno.",
      },
      {
        page: 2,
        text: "Coluna vertebral\nSão 7 vértebras cervicais, 12 torácicas e 5 lombares.\nO sacro e o cóccix fecham a coluna.",
      },
      {
        page: 3,
        text: "Caixa torácica\nAs costelas verdadeiras se ligam direto ao esterno.\nAs falsas e as flutuantes completam os 12 pares.",
      },
    ]);
  });

  it("a página escaneada vai para o OCR, e só ela", async () => {
    const progress: ReadProgress[] = [];
    const asked: number[] = [];
    const reading = await readPdf(fixture("bioquimica-escaneada.pdf"), {
      lib,
      params,
      onProgress: (p) => progress.push(p),
      ocrPage: async (page) => {
        asked.push(page.pageNumber);
        return "As enzimas são proteínas.";
      },
    });
    expect(asked).toEqual([2]);
    expect(reading.usedOcr).toBe(true);
    expect(reading.pages[0].text).toContain("Apostila de Bioquímica");
    expect(reading.pages[1]).toEqual({ page: 2, text: "As enzimas são proteínas." });
    expect(progress).toEqual([
      { step: "reading", page: 1, total: 2 },
      { step: "reading", page: 2, total: 2 },
      { step: "ocr", page: 1, total: 1 },
    ]);
  });

  it("sem OCR, a página escaneada fica vazia; o OCR sem nada não apaga o que havia", async () => {
    const plain = await readPdf(fixture("bioquimica-escaneada.pdf"), { lib, params });
    expect(plain.pages[1].text).toBe("");
    expect(plain.usedOcr).toBe(false);
    const noise = await readPdf(fixture("bioquimica-escaneada.pdf"), { lib, params, ocrPage: async () => "" });
    expect(noise.usedOcr).toBe(false);
  });

  it("devolve os espaços e quebras que o PDF só sugere", () => {
    const item = (str: string, x: number, y: number, width: number, hasEOL = false) => ({
      str,
      dir: "ltr",
      transform: [10, 0, 0, 10, x, y],
      width,
      height: 10,
      fontName: "f",
      hasEOL,
    });
    expect(joinTextItems([item("Fêmur", 0, 100, 30), item("e", 34, 100, 6), item("tíbia", 0, 80, 25)])).toBe(
      "Fêmur e\ntíbia",
    );
    expect(joinTextItems([item("fosfo", 0, 100, 25), item("rilação", 25, 100, 35)])).toBe("fosforilação");
  });
});

describe("OCR (tesseract.js, português)", () => {
  const cache = mkdtempSync(join(tmpdir(), "lanima-ocr-"));
  afterAll(() => rmSync(cache, { recursive: true, force: true }));

  it("uma foto de página de livro vira texto", { timeout: 120_000 }, async () => {
    const ocr = await createOcr({
      langPath: join(modules, "@tesseract.js-data", "por", "4.0.0_best_int"),
      cachePath: cache,
    });
    try {
      const text = await ocr.read(Buffer.from(fixture("livro-pagina.png")));
      expect(text).toContain("Capítulo 4");
      expect(text).toContain("As enzimas são proteínas que aceleram");
      expect(text).toContain("substrato específico no sítio ativo.");
      expect(text).toContain("desnaturação");
    } finally {
      await ocr.close();
    }
  });
});
