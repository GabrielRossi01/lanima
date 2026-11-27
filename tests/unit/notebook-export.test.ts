// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import type { SummaryContent } from "@/lib/ai/schemas";
import { textBoxHeight } from "@/lib/ink/erase";
import type { Stroke } from "@/lib/ink/strokes";
import { PDF_FONT_FILES } from "@/lib/extract/vendor";
import { summaryToPages } from "@/lib/notebook/from-summary";
import { pageSourceName } from "@/lib/notebook/format";
import { notebookPdf } from "@/lib/notebook/pdf";
import { searchItems, type SearchItem } from "@/lib/search/search";
import { woffToTtf } from "../../scripts/woff-to-ttf.mjs";

const modules = join(__dirname, "..", "..", "node_modules");
const sans = woffToTtf(new Uint8Array(readFileSync(join(modules, PDF_FONT_FILES.sans.from))));

async function texts(data: Uint8Array): Promise<string[]> {
  const doc = await pdfjs.getDocument({
    data,
    standardFontDataUrl: join(modules, "pdfjs-dist", "standard_fonts") + "/",
  }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    out.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " "),
    );
  }
  return out;
}

const stroke = (id: string, tool: Stroke["tool"] = "caneta"): Stroke => ({
  id,
  tool,
  color: tool === "marca_texto" ? "amarelo" : "grafite",
  size: tool === "marca_texto" ? 22 : 3.6,
  points: [
    [100, 200, 0.4],
    [300, 210, 0.7],
    [500, 200, 0.5],
  ],
});

/** A 2×2 red PNG. */
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DAwMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

describe("caderno em PDF", () => {
  it("uma página A4 por página do caderno, com o texto das caixas e o fundo", async () => {
    const bytes = await notebookPdf(
      {
        title: "Aula 07 · Sistema esquelético",
        pages: [
          {
            background: "pontilhado",
            strokes: [stroke("h", "marca_texto"), stroke("a"), stroke("l", "lapis")],
            elements: [
              { id: "t", type: "texto", x: 100, y: 300, w: 600, text: "Fêmur: o osso mais longo", size: 24 },
              {
                id: "i",
                type: "imagem",
                x: 100,
                y: 400,
                w: 200,
                h: 200,
                imageId: "a0000000-0000-4000-8000-000000000001",
              },
            ],
          },
          { background: "pautado", strokes: [], elements: [] },
        ],
        images: new Map([["a0000000-0000-4000-8000-000000000001", { bytes: PNG, kind: "png" as const }]]),
      },
      sans,
    );
    // The strokes are vector paths in the page: the same page without them is smaller.
    const withoutStrokes = await notebookPdf(
      {
        title: "Aula",
        pages: [{ background: "pontilhado", strokes: [], elements: [] }],
        images: new Map(),
      },
      sans,
    );
    const withStrokes = await notebookPdf(
      {
        title: "Aula",
        pages: [{ background: "pontilhado", strokes: [stroke("a"), stroke("b")], elements: [] }],
        images: new Map(),
      },
      sans,
    );
    expect(withStrokes.length).toBeGreaterThan(withoutStrokes.length + 300);

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const { width, height } = doc.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
    expect(doc.getTitle()).toBe("Aula 07 · Sistema esquelético");
    const [first, second] = await texts(bytes);
    // Real text (accents included), not a picture of it.
    expect(first).toContain("Fêmur: o osso mais longo");
    expect(second).toBe("");
  });

  it("sem a fonte do app, usa a fonte padrão do PDF e o texto ainda sai", async () => {
    const bytes = await notebookPdf(
      {
        title: "Aula",
        pages: [
          {
            background: "liso",
            strokes: [],
            elements: [{ id: "t", type: "texto", x: 100, y: 100, w: 600, text: "Tíbia → perna", size: 24 }],
          },
        ],
        images: new Map(),
      },
      null,
    );
    const [first] = await texts(bytes);
    expect(first).toContain("Tíbia");
  });
});

describe("salvar um resumo no caderno", () => {
  const content = (topics: number, points: number): SummaryContent => ({
    titulo: "Sistema esquelético",
    topicos: Array.from({ length: topics }, (_, t) => ({
      id: `t${t}`,
      titulo: `Tópico ${t + 1}`,
      pontos: Array.from({ length: points }, (_, p) => ({
        id: `p${t}-${p}`,
        texto: `Ponto ${p + 1} do tópico ${t + 1}, com uma frase de tamanho comum para um resumo.`,
        fonte: null,
      })),
    })),
    termosChave: [{ termo: "Diáfise", definicao: "corpo do osso longo" }],
    pontosDeAtencao: ["Não confundir epífise com diáfise."],
  });
  let n = 0;
  const id = () => `x${n++}`;

  it("título, tópicos com os pontos, termos-chave e pontos de atenção, em ordem", () => {
    const [page] = summaryToPages(content(2, 2), id);
    expect(page.map((b) => b.text.split("\n")[0])).toEqual([
      "Sistema esquelético",
      "1. Tópico 1",
      "• Ponto 1 do tópico 1, com uma frase de tamanho comum para um resumo.",
      "2. Tópico 2",
      "• Ponto 1 do tópico 2, com uma frase de tamanho comum para um resumo.",
      "Termos-chave",
      "• Diáfise: corpo do osso longo",
      "Pontos de atenção",
      "• Não confundir epífise com diáfise.",
    ]);
    // One under the other, none overlapping.
    for (let i = 1; i < page.length; i++)
      expect(page[i].y).toBeGreaterThanOrEqual(page[i - 1].y + textBoxHeight(page[i - 1]));
  });

  it("um resumo longo continua nas páginas seguintes, sem passar do fim da folha", () => {
    const pages = summaryToPages(content(12, 8), id);
    expect(pages.length).toBeGreaterThan(2);
    for (const page of pages) {
      expect(page.length).toBeGreaterThan(0);
      for (const box of page) expect(box.y + textBoxHeight(box)).toBeLessThanOrEqual(1414 - 70 + 1);
    }
    const all = pages.flat().map((b) => b.text);
    expect(all.filter((t) => t.startsWith("• Ponto"))).toHaveLength(12);
  });
});

describe("busca no caderno", () => {
  it("acha a página pelo texto das caixas, sem acento", () => {
    const items: SearchItem[] = [
      {
        kind: "nota",
        id: "p",
        title: pageSourceName("Aula 07", 1),
        detail: "Fêmur…",
        body: "Fêmur: o osso mais longo. Tíbia e fíbula.",
        href: "/caderno/editar?pagina=p",
      },
    ];
    expect(searchItems(items, "tibia").map((r) => r.title)).toEqual(["Aula 07 · pág. 2"]);
    expect(searchItems(items, "umero")).toEqual([]);
  });
});
