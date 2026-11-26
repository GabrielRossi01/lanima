// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildContext, type Context, type SourceDocument } from "@/lib/ai/context";
import { generateQuestions, generateSummary, newLog, planSummary, proposalCounts } from "@/lib/ai/generate";
import { providersFromEnv } from "@/lib/ai/providers";
import { DIFFICULTIES, summaryContentSchema, type QuestionDraft } from "@/lib/ai/schemas";
import { readPdf } from "@/lib/extract/pdf";
import { chunkPages } from "@/lib/extract/text";

// The two sample PDFs of section 7.12, read like the app reads them, then summarized and turned into
// questions by the simulated provider. Checks the format, the sources and the levels.

const modules = join(__dirname, "..", "..", "node_modules");
const lib = pdfjs as unknown as Parameters<typeof readPdf>[1]["lib"];
const params = { standardFontDataUrl: join(modules, "pdfjs-dist", "standard_fonts") + "/" };
const providers = () => providersFromEnv({ AI_PRIMARY_PROVIDER: "mock" });

async function document(file: string, id: string, excludedPages: number[] = []): Promise<SourceDocument> {
  const data = new Uint8Array(readFileSync(join(__dirname, "..", "ai-fixtures", file)));
  const reading = await readPdf(data, { lib, params });
  return { id, name: file, excludedPages, chunks: chunkPages(reading.pages) };
}

const ANATOMIA = "11111111-1111-4111-8111-111111111111";
const BIOQUIMICA = "22222222-2222-4222-8222-222222222222";
let anatomia: SourceDocument;
let bioquimica: SourceDocument;

beforeAll(async () => {
  anatomia = await document("anatomia-sistema-esqueletico.pdf", ANATOMIA);
  bioquimica = await document("bioquimica-enzimas.pdf", BIOQUIMICA);
});

const pagesOf = (context: Context) => new Set(context.chunks.map((c) => `${c.documentId}:${c.page}`));

describe("PDFs de exemplo", () => {
  it("cada um tem 6 páginas com texto", () => {
    expect(new Set(anatomia.chunks.map((c) => c.page)).size).toBe(6);
    expect(new Set(bioquimica.chunks.map((c) => c.page)).size).toBe(6);
    expect(anatomia.chunks[0].text).toContain("206 ossos");
  });
});

describe("Resumo dos PDFs de exemplo", () => {
  it.each(["curto", "medio", "completo"] as const)(
    "nível %s: formato válido e todo ponto com fonte enviada",
    async (detail) => {
      const context = buildContext([anatomia, bioquimica]);
      const plan = planSummary(context, providers());
      expect(plan.requests).toBe(1);
      const log = newLog(providers());
      const content = await generateSummary({ context, plan, detail, focus: null, providers: providers(), log });
      expect(summaryContentSchema.safeParse(content).success).toBe(true);
      const sent = pagesOf(context);
      const points = content.topicos.flatMap((t) => [...t.pontos, ...(t.subtopicos ?? []).flatMap((s) => s.pontos)]);
      expect(points.length).toBeGreaterThan(0);
      for (const p of points) expect(sent.has(`${p.fonte!.documentId}:${p.fonte!.pagina}`)).toBe(true);
      expect(log).toMatchObject({ requests: 1, provider: "mock" });
    },
  );

  it("páginas excluídas não vão para a IA nem aparecem como fonte", async () => {
    const context = buildContext([{ ...anatomia, excludedPages: [1, 6] }]);
    expect([...new Set(context.chunks.map((c) => c.page))]).toEqual([2, 3, 4, 5]);
    const content = await generateSummary({
      context,
      plan: planSummary(context, providers()),
      detail: "completo",
      focus: null,
      providers: providers(),
      log: newLog(providers()),
    });
    const pages = content.topicos.flatMap((t) => t.pontos.map((p) => p.fonte!.pagina));
    expect(pages).not.toContain(1);
    expect(pages).not.toContain(6);
  });

  it("material grande: resume por partes e junta, sem perder as fontes", async () => {
    const context = buildContext([anatomia, bioquimica]);
    const small = { ...providers(), maxInputTokens: 700 };
    const plan = planSummary(context, small);
    expect(plan.groups.length).toBeGreaterThan(1);
    expect(plan.requests).toBe(plan.groups.length + 1);
    const log = newLog(small);
    const progress: string[] = [];
    const content = await generateSummary({
      context,
      plan,
      detail: "medio",
      focus: null,
      providers: small,
      log,
      onProgress: (m) => progress.push(m),
    });
    expect(log.requests).toBe(plan.requests);
    expect(progress.at(-1)).toBe("Juntando as partes…");
    const docs = new Set(content.topicos.flatMap((t) => t.pontos.map((p) => p.fonte!.documentId)));
    expect(docs).toEqual(new Set([ANATOMIA, BIOQUIMICA]));
  });
});

describe("Questões dos PDFs de exemplo", () => {
  it("5 fáceis, 10 médias e 5 difíceis viram uma proposta de ~1,5×, com fonte e nível", async () => {
    const counts = proposalCounts({ facil: 5, medio: 10, dificil: 5 });
    expect(counts).toEqual({ facil: 8, medio: 15, dificil: 8 });
    const context = buildContext([anatomia, bioquimica]);
    const { drafts } = await generateQuestions({
      context,
      counts,
      types: ["multipla_escolha", "verdadeiro_falso", "associacao", "caso_clinico", "resposta_curta"],
      topics: [],
      avoid: [],
      providers: providers(),
      log: newLog(providers()),
    });
    const by = (d: string) => drafts.filter((q) => q.difficulty === d).length;
    expect(DIFFICULTIES.map(by)).toEqual([8, 15, 8]);
    const sent = pagesOf(context);
    for (const q of drafts) {
      expect(sent.has(`${q.source.documentId}:${q.source.page}`)).toBe(true);
      expect(q.source.excerpt.length).toBeGreaterThan(0);
      expect(q.explanation.length).toBeGreaterThan(0);
    }
    expect(new Set(drafts.map((q) => q.type)).size).toBe(5);
  });

  it("só os tipos pedidos, nos tópicos pedidos, sem repetir o banco", async () => {
    const context = buildContext([bioquimica]);
    const first = await generateQuestions({
      context,
      counts: { facil: 3 },
      types: ["verdadeiro_falso"],
      topics: [{ title: "Inibição enzimática" }, { title: "Cinética enzimática" }],
      avoid: [],
      providers: providers(),
      log: newLog(providers()),
    });
    expect(first.drafts.every((q: QuestionDraft) => q.type === "verdadeiro_falso")).toBe(true);
    expect(new Set(first.drafts.map((q) => q.topic))).toEqual(new Set(["Inibição enzimática", "Cinética enzimática"]));

    const again = await generateQuestions({
      context,
      counts: { facil: 3 },
      types: ["verdadeiro_falso"],
      topics: [{ title: "Inibição enzimática" }, { title: "Cinética enzimática" }],
      avoid: first.drafts.map((q) => q.statement),
      providers: providers(),
      log: newLog(providers()),
    });
    expect(again.drafts).toEqual([]);
    expect(again.rejected.duplicada).toBe(3);
  });
});
