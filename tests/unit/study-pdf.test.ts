// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { SummaryContent } from "@/lib/ai/schemas";
import { PDF_FONT_FILES } from "@/lib/extract/vendor";
import { pdfFileName, studyPdf, summaryPdf, testPdf, type PdfFontFiles, type PdfQuestion } from "@/lib/study/pdf";
import { woffToTtf } from "../../scripts/woff-to-ttf.mjs";

// "Exportar em PDF" (section 7.5): the PDFs are read back with pdf.js, page by page.

const modules = join(__dirname, "..", "..", "node_modules");
// The TrueType the app serves: converted like scripts/copy-vendor.mjs does.
const font = (from: string) => woffToTtf(new Uint8Array(readFileSync(join(modules, from))));
const fonts: PdfFontFiles = {
  serif: font(PDF_FONT_FILES.serif.from),
  sans: font(PDF_FONT_FILES.sans.from),
  sansBold: font(PDF_FONT_FILES.sansBold.from),
};

async function pages(data: Uint8Array): Promise<string[]> {
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

const DOC = "11111111-1111-4111-8111-111111111111";
const fileName = (id: string) => (id === DOC ? "Slides Aula 07" : null);

function summary(points: number): SummaryContent {
  return {
    titulo: "Sistema esquelético",
    topicos: [
      {
        id: "t1",
        titulo: "Funções dos ossos",
        pontos: Array.from({ length: points }, (_, i) => ({
          id: `p${i}`,
          texto: `Ponto ${i + 1}: sustentação, proteção e hematopoese na medula óssea vermelha, com ação dos osteoclastos.`,
          fonte: { documentId: DOC, pagina: (i % 3) + 2 },
          destaque: i === 0 ? ("amarelo" as const) : null,
        })),
        subtopicos: [{ id: "s1", titulo: "Classificação", pontos: [{ id: "q", texto: "Ossos longos.", fonte: null }] }],
      },
    ],
    termosChave: [{ termo: "Diáfise", definicao: "O corpo do osso longo." }],
    pontosDeAtencao: ["Não confundir osteoblasto ↔ osteoclasto."],
  };
}

const QUESTIONS: PdfQuestion[] = [
  {
    id: "a",
    type: "multipla_escolha",
    difficulty: "facil",
    topic: "Ossos",
    statement: "Quantos ossos tem o esqueleto adulto?",
    options: ["196", "206", "216", "226"],
    answer: { index: 1 },
    explanation: "O esqueleto adulto tem 206 ossos.",
    source: { documentId: DOC, page: 3 },
  },
  {
    id: "b",
    type: "associacao",
    difficulty: "medio",
    topic: "Células",
    statement: "Associe cada célula à sua função.",
    options: { left: ["Osteoblasto", "Osteoclasto"], right: ["Reabsorve osso", "Forma matriz"] },
    answer: { match: [1, 0] },
    explanation: "",
    source: null,
  },
  {
    id: "c",
    type: "resposta_curta",
    difficulty: "dificil",
    topic: "Ossos",
    statement: "O que é a diáfise?",
    options: null,
    answer: { text: "O corpo do osso longo." },
    explanation: "",
    source: null,
  },
];

describe("PDF do resumo", () => {
  it("tem título, tópicos numerados, acentos e as fontes no rodapé de cada página", async () => {
    const text = await pages(await summaryPdf({ content: summary(3), meta: "Anatomia · hoje", fileName }, fonts));
    expect(text).toHaveLength(1);
    const [page] = text;
    expect(page).toContain("Sistema esquelético");
    expect(page).toContain("1. Funções dos ossos");
    expect(page).toContain("1.1");
    expect(page).toContain("1.1 Classificação");
    expect(page).toContain("hematopoese na medula óssea vermelha, com ação dos osteoclastos.");
    expect(page).toContain("[1] Slides Aula 07, p. 2");
    expect(page).toContain("[3] Slides Aula 07, p. 4");
    expect(page).toContain("Diáfise:");
    // The fonts have no "↔": it becomes a dash.
    expect(page).toContain("osteoblasto – osteoclasto");
    expect(page).toContain("Página 1 de 1");
  });

  it("um resumo longo quebra em páginas, e cada rodapé cita só as fontes daquela página", async () => {
    const text = await pages(await summaryPdf({ content: summary(60), meta: "Anatomia", fileName }, fonts));
    expect(text.length).toBeGreaterThan(2);
    text.forEach((page, i) => expect(page).toContain(`Página ${i + 1} de ${text.length}`));
    // Each page cites what its points cite: p. 2, 3 and 4 are used on every full page.
    for (const page of text.slice(0, -1)) {
      expect(page).toMatch(/\[1\] Slides Aula 07, p\. 2/);
      expect(page).toMatch(/\[2\] Slides Aula 07, p\. 3/);
    }
  });

  it("sem as fontes do app (offline), usa as fontes padrão do PDF e mantém os acentos", async () => {
    const [page] = await pages(await summaryPdf({ content: summary(2), meta: "Anatomia", fileName }, null));
    expect(page).toContain("hematopoese na medula óssea vermelha, com ação dos osteoclastos.");
    expect(page).toContain("osteoblasto – osteoclasto");
  });
});

describe("PDF do teste", () => {
  it("sem gabarito: as questões, sem as respostas", async () => {
    const text = (
      await pages(
        await testPdf(
          { title: "Ossos · revisão", meta: "Anatomia", questions: QUESTIONS, answerKey: false, fileName },
          fonts,
        ),
      )
    ).join(" ");
    expect(text).toContain("Questão 1");
    expect(text).toContain("Fácil · Múltipla escolha · Ossos");
    expect(text).toContain("B) 206");
    expect(text).toContain("1. Osteoblasto");
    expect(text).toContain("( ) Forma matriz");
    expect(text).not.toContain("Gabarito");
    expect(text).not.toContain("O esqueleto adulto tem 206 ossos.");
  });

  it("com gabarito: separado no fim, com a explicação e a fonte", async () => {
    const text = await pages(
      await testPdf(
        { title: "Ossos · revisão", meta: "Anatomia", questions: QUESTIONS, answerKey: true, fileName },
        fonts,
      ),
    );
    const key = text[text.length - 1];
    expect(text.slice(0, -1).join(" ")).not.toContain("Gabarito");
    expect(key).toContain("Gabarito");
    expect(key).toContain("1. B) 206");
    expect(key).toContain("O esqueleto adulto tem 206 ossos.");
    expect(key).toContain("[1] Slides Aula 07, p. 3");
    expect(key).toContain("2. Osteoblasto – Forma matriz; Osteoclasto – Reabsorve osso");
    expect(key).toContain("3. O corpo do osso longo.");
  });

  it("o texto copiado do PDF é o mesmo, também nos títulos em Fraunces e no negrito (sem ligaduras)", async () => {
    const [page] = await pages(
      await testPdf(
        {
          title: "Classificação dos ossos",
          meta: "Anatomia",
          questions: [{ ...QUESTIONS[0], topic: "Fisiologia" }],
          answerKey: false,
          fileName,
        },
        fonts,
      ),
    );
    expect(page).toContain("Classificação dos ossos");
    expect(page).toContain("Fisiologia");
  });

  it("resumos e testes juntos: capa com a lista, cada um em páginas próprias, gabarito logo depois do teste", async () => {
    const text = await pages(
      await studyPdf(
        {
          meta: "Todas as matérias",
          summaries: [{ content: summary(2), meta: "Anatomia" }],
          tests: [
            { title: "Ossos · revisão", meta: "Anatomia", questions: QUESTIONS, answerKey: true },
            { title: "Células", meta: "Histologia", questions: QUESTIONS.slice(0, 1), answerKey: true },
          ],
          fileName,
        },
        fonts,
      ),
    );
    expect(text[0]).toContain("Resumos e testes");
    expect(text[0]).toContain("RESUMO Sistema esquelético");
    expect(text[0]).toContain("TESTE Ossos · revisão");
    expect(text[0]).toContain("TESTE Células");
    const starts = (s: string) => text.findIndex((p) => p.includes(s));
    expect(starts("1. Funções dos ossos")).toBe(1);
    expect(starts("Gabarito · Ossos · revisão")).toBeGreaterThan(starts("Questão 3"));
    expect(starts("Gabarito · Células")).toBeGreaterThan(starts("Gabarito · Ossos · revisão"));
    text.forEach((page, i) => expect(page).toContain(`Página ${i + 1} de ${text.length}`));
  });

  it("nome do arquivo sem caracteres proibidos", () => {
    expect(pdfFileName("Ossos: revisão / P1")).toBe("Ossos revisão P1.pdf");
    expect(pdfFileName("  ")).toBe("Lanima.pdf");
  });
});
