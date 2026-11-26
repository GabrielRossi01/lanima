// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildContext, estimateTokens, selectForTopics, type ContextChunk } from "@/lib/ai/context";
import { AiError, generateQuestions, generateSummary, newLog, planSummary } from "@/lib/ai/generate";
import { questionsKey, summaryKey } from "@/lib/ai/keys";
import { remainingLabel } from "@/lib/ai/messages";
import { gemini, groq, ProviderError, providersFromEnv, type Provider, type Providers } from "@/lib/ai/providers";
import { AI_QUESTIONS_JSON, type AiQuestion } from "@/lib/ai/schemas";
import {
  dedupe,
  isNearDuplicate,
  permutation,
  sentenceCount,
  toQuestionDraft,
  toSummaryContent,
} from "@/lib/ai/validate";

const DOC = "11111111-1111-4111-8111-111111111111";
const context = buildContext([
  {
    id: DOC,
    name: "Enzimas.pdf",
    excludedPages: [3],
    chunks: [
      { position: 0, page: 1, text: "Enzimas\nEnzimas aceleram reações químicas sem serem consumidas." },
      { position: 1, page: 2, text: "Inibição\nO inibidor competitivo disputa o sítio ativo." },
      { position: 2, page: 3, text: "Referências\nLivro X." },
    ],
  },
]);
const sent = context.chunks;

const question = (over: Partial<AiQuestion> = {}): AiQuestion => ({
  topico: "Enzimas",
  dificuldade: "facil",
  tipo: "multipla_escolha",
  enunciado: "O que as enzimas fazem com as reações químicas?",
  alternativas: ["Aceleram", "Impedem", "Invertem", "Consomem"],
  correta: 0,
  verdadeiro: null,
  pares: null,
  respostaEsperada: null,
  explicacao: "Enzimas aceleram reações sem serem consumidas.",
  doc: "D1",
  pagina: 1,
  trecho: "Enzimas aceleram reações químicas",
  ...over,
});
const allowed = {
  types: ["multipla_escolha", "verdadeiro_falso", "associacao", "caso_clinico", "resposta_curta"] as const,
  difficulties: ["facil", "medio", "dificil"] as const,
};

describe("contexto enviado à IA", () => {
  it("marca documento e página, e deixa de fora as páginas excluídas", () => {
    expect(sent.map((c) => c.page)).toEqual([1, 2]);
    expect(context.labels.get("D1")).toBe(DOC);
    expect(estimateTokens("x".repeat(35))).toBe(10);
  });

  it("com pouco espaço, prefere as páginas do tópico", () => {
    const chunks: ContextChunk[] = Array.from({ length: 10 }, (_, i) => ({
      label: "D1",
      documentId: DOC,
      page: i + 1,
      text:
        i === 6 ? "Inibição competitiva e não competitiva. " + "x ".repeat(200) : "Outro assunto. " + "y ".repeat(200),
    }));
    const one = estimateTokens(chunks[0].text) + 8;
    const picked = selectForTopics(chunks, [{ title: "Inibição enzimática" }], one * 2);
    expect(picked.map((c) => c.page)).toContain(7);
    expect(picked.length).toBeLessThanOrEqual(2);
    // Pages the summary cited for the topic come first, even without the words.
    const cited = selectForTopics(chunks, [{ title: "Nada a ver", pages: [{ documentId: DOC, page: 3 }] }], one);
    expect(cited.map((c) => c.page)).toEqual([3]);
  });
});

describe("resumo: só o que tem fonte", () => {
  it("descarta pontos sem página válida e tópicos que ficam vazios", () => {
    const content = toSummaryContent(
      {
        titulo: "Enzimas",
        topicos: [
          {
            titulo: "O que são",
            pontos: [
              { texto: "Aceleram reações.", doc: "D1", pagina: 1 },
              { texto: "Página excluída.", doc: "D1", pagina: 3 },
              { texto: "Documento inventado.", doc: "D9", pagina: 1 },
            ],
            subtopicos: [{ titulo: "Vazio", pontos: [{ texto: "Sem fonte.", doc: "D1", pagina: 99 }] }],
          },
          { titulo: "Só inventado", pontos: [{ texto: "x", doc: "D2", pagina: 1 }], subtopicos: [] },
        ],
        termosChave: [
          { termo: "Enzima", definicao: "Catalisador biológico." },
          { termo: "enzima", definicao: "Repetido." },
        ],
        pontosDeAtencao: [
          { texto: "Competitivo muda o Km.", doc: "d1", pagina: 2 },
          { texto: "Inventado.", doc: "D1", pagina: 40 },
        ],
      },
      sent,
    );
    expect(content).toEqual({
      titulo: "Enzimas",
      topicos: [
        {
          id: "t0",
          titulo: "O que são",
          pontos: [{ id: "p0", texto: "Aceleram reações.", fonte: { documentId: DOC, pagina: 1 } }],
        },
      ],
      termosChave: [{ termo: "Enzima", definicao: "Catalisador biológico." }],
      pontosDeAtencao: ["Competitivo muda o Km."],
    });
  });

  it("sem nenhum ponto com fonte, não há resumo", () => {
    expect(
      toSummaryContent(
        {
          titulo: "x",
          topicos: [{ titulo: "y", pontos: [{ texto: "z", doc: "D5", pagina: 1 }], subtopicos: [] }],
          termosChave: [],
          pontosDeAtencao: [],
        },
        sent,
      ),
    ).toBeNull();
  });
});

describe("questões: as regras da seção 7.12", () => {
  it("aceita uma questão certa e guarda a fonte", () => {
    expect(toQuestionDraft(question(), sent, allowed)).toEqual({
      topic: "Enzimas",
      difficulty: "facil",
      type: "multipla_escolha",
      statement: "O que as enzimas fazem com as reações químicas?",
      options: ["Aceleram", "Impedem", "Invertem", "Consomem"],
      answer: { index: 0 },
      explanation: "Enzimas aceleram reações sem serem consumidas.",
      source: { documentId: DOC, page: 1, excerpt: "Enzimas aceleram reações químicas" },
    });
  });

  it.each([
    [{ pagina: 3 }, "sem_fonte"],
    [{ doc: "D2" }, "sem_fonte"],
    [{ alternativas: ["A", "B", "C"] }, "alternativas"],
    [{ alternativas: ["Aceleram", "aceleram!", "Invertem", "Consomem"] }, "alternativas"],
    [{ alternativas: ["Aceleram", "Impedem", "Invertem", "Todas as anteriores"] }, "anteriores"],
    [{ alternativas: ["Aceleram", "Impedem", "Invertem", "Nenhuma das alternativas"] }, "anteriores"],
    [{ correta: 4 }, "gabarito"],
    [{ correta: null }, "gabarito"],
    [{ explicacao: "Uma. Duas. Três. Quatro." }, "explicacao"],
    [{ explicacao: "" }, "explicacao"],
    [{ enunciado: "Curta?" }, "enunciado"],
    [{ tipo: "verdadeiro_falso" as const }, "gabarito"],
    [{ tipo: "resposta_curta" as const }, "resposta"],
    [{ tipo: "associacao" as const, pares: [{ esquerda: "a", direita: "b" }] }, "pares"],
  ])("recusa %j (%s)", (over, reason) => {
    expect(toQuestionDraft(question(over as Partial<AiQuestion>), sent, allowed)).toBe(reason);
  });

  it("recusa tipo e nível que não foram pedidos", () => {
    expect(toQuestionDraft(question(), sent, { types: ["verdadeiro_falso"], difficulties: ["facil"] })).toBe(
      "tipo_nao_pedido",
    );
    expect(toQuestionDraft(question(), sent, { types: ["multipla_escolha"], difficulties: ["dificil"] })).toBe(
      "nivel_nao_pedido",
    );
  });

  it("associação: a coluna da direita vem embaralhada e o gabarito acompanha", () => {
    const pares = [
      { esquerda: "Osteoblasto", direita: "Produz matriz" },
      { esquerda: "Osteócito", direita: "Mantém o tecido" },
      { esquerda: "Osteoclasto", direita: "Reabsorve osso" },
      { esquerda: "Condrócito", direita: "Célula da cartilagem" },
    ];
    const draft = toQuestionDraft(
      question({ tipo: "associacao", pares, alternativas: null, correta: null }),
      sent,
      allowed,
    );
    if (typeof draft === "string") throw new Error(draft);
    const { left, right } = draft.options as { left: string[]; right: string[] };
    const { match } = draft.answer as { match: number[] };
    expect(left).toEqual(pares.map((p) => p.esquerda));
    expect(right).not.toEqual(pares.map((p) => p.direita));
    left.forEach((_, i) => expect(right[match[i]]).toBe(pares[i].direita));
  });

  it("embaralhamento determinístico e nunca na mesma ordem", () => {
    expect(permutation(4, "x")).toEqual(permutation(4, "x"));
    for (const seed of ["a", "b", "c", "d", "e", "f"]) expect(permutation(3, seed)).not.toEqual([0, 1, 2]);
  });

  it("conta frases sem se confundir com abreviações", () => {
    expect(sentenceCount("Ver fig. 2 do material. Está na pág. 3.")).toBe(2);
  });

  it("remove questões iguais ou quase iguais, também as que já estão no banco", () => {
    expect(isNearDuplicate("Qual é a função do osteoclasto?", "qual e a funcao do OSTEOCLASTO")).toBe(true);
    expect(isNearDuplicate("Qual é a função do osteoclasto?", "Qual é a função do osteoblasto?")).toBe(false);
    const list = [
      { statement: "A" + " palavra".repeat(20) },
      { statement: "A" + " palavra".repeat(20) + "!" },
      { statement: "Outra questão diferente" },
    ];
    expect(dedupe(list).map((q) => q.statement)).toEqual([list[0].statement, "Outra questão diferente"]);
    expect(dedupe(list, ["outra questao diferente"])).toHaveLength(1);
  });
});

/** A provider that answers from a list (texts or errors), counting the calls. */
function scripted(
  name: string,
  answers: (string | ProviderError)[],
  maxTokens: number | null = null,
): Provider & { calls: string[] } {
  const calls: string[] = [];
  return {
    name,
    model: `${name}-m`,
    maxTokens,
    calls,
    async generate(request) {
      calls.push(request.user);
      const next = answers.shift();
      if (next === undefined) throw new Error("sem resposta");
      if (next instanceof ProviderError) throw next;
      return { text: next, inputTokens: 10, outputTokens: 5 };
    },
  };
}

const goodQuestions = JSON.stringify({ questoes: [question()] });
const withProviders = (primary: Provider, fallback: Provider | null = null, maxInputTokens = 100_000): Providers => ({
  primary,
  fallback,
  maxInputTokens,
});
const ask = (providers: Providers) =>
  generateQuestions({
    context,
    counts: { facil: 1 },
    types: ["multipla_escolha"],
    topics: [],
    avoid: [],
    providers,
    log: newLog(providers),
  });

describe("provedor principal, reserva e nova tentativa", () => {
  it("resposta fora do formato: tenta de novo uma vez, dizendo o erro", async () => {
    const primary = scripted("google", ["não é json", goodQuestions]);
    const providers = withProviders(primary);
    const log = newLog(providers);
    const result = await generateQuestions({
      context,
      counts: { facil: 1 },
      types: ["multipla_escolha"],
      topics: [],
      avoid: [],
      providers,
      log,
    });
    expect(result.drafts).toHaveLength(1);
    expect(primary.calls).toHaveLength(2);
    expect(primary.calls[1]).toContain("não passou na validação: o texto não é um JSON válido");
    expect(log.requests).toBe(2);
  });

  it("a IA mandou a mais de um nível: fica só o pedido", async () => {
    const extra = ["Qual osso protege o encéfalo?", "Onde fica o sítio ativo?", "O que reduz a energia de ativação?"];
    const many = JSON.stringify({ questoes: extra.map((enunciado) => question({ enunciado })) });
    const result = await ask(withProviders(scripted("google", [many])));
    expect(result.drafts.map((q) => q.statement)).toEqual([extra[0]]);
  });

  it("duas respostas fora das regras: erro amigável", async () => {
    const bad = JSON.stringify({ questoes: [question({ pagina: 3 })] });
    const primary = scripted("google", [bad, bad]);
    await expect(ask(withProviders(primary))).rejects.toMatchObject({ kind: "invalid" });
    expect(primary.calls[1]).toContain("nenhuma questão seguiu as regras");
  });

  it("429 no principal: chama a reserva, que fica registrada", async () => {
    const primary = scripted("google", [new ProviderError("quota", "429")]);
    const fallback = scripted("groq", [goodQuestions], 6000);
    const providers = withProviders(primary, fallback);
    const log = newLog(providers);
    await generateQuestions({
      context,
      counts: { facil: 1 },
      types: ["multipla_escolha"],
      topics: [],
      avoid: [],
      providers,
      log,
    });
    expect(fallback.calls).toHaveLength(1);
    expect(log).toMatchObject({ provider: "groq", model: "groq-m", requests: 1 });
  });

  it("pedido grande demais para a reserva: avisa que está ocupado", async () => {
    const primary = scripted("google", [new ProviderError("unavailable", "503")]);
    const fallback = scripted("groq", [goodQuestions], 50);
    await expect(ask(withProviders(primary, fallback))).rejects.toMatchObject({ kind: "busy" });
    expect(fallback.calls).toHaveLength(0);
  });

  it("chave ou modelo errado: não tenta a reserva", async () => {
    const primary = scripted("google", [new ProviderError("config", "403")]);
    const fallback = scripted("groq", [goodQuestions], 6000);
    await expect(ask(withProviders(primary, fallback))).rejects.toBeInstanceOf(AiError);
    expect(fallback.calls).toHaveLength(0);
  });

  it("sem texto nenhum: nem chama a IA", async () => {
    const empty = buildContext([{ id: DOC, name: "x", excludedPages: [], chunks: [] }]);
    const providers = withProviders(scripted("google", []));
    expect(() => planSummary(empty, providers)).toThrow(AiError);
    await expect(
      generateSummary({
        context: empty,
        plan: { groups: [], requests: 0 },
        detail: "curto",
        focus: null,
        providers,
        log: newLog(providers),
      }),
    ).rejects.toThrow();
  });
});

describe("configuração", () => {
  it("o simulado nunca roda num deploy da Vercel", () => {
    expect(() => providersFromEnv({ AI_PRIMARY_PROVIDER: "mock", VERCEL: "1" })).toThrow(ProviderError);
  });

  it("falta de chave ou modelo é erro de configuração; a reserva quebrada não derruba o principal", () => {
    expect(() => providersFromEnv({ AI_PRIMARY_PROVIDER: "google", AI_PRIMARY_MODEL: "m" })).toThrow(
      "GOOGLE_GENERATIVE_AI_API_KEY",
    );
    expect(() => providersFromEnv({ AI_PRIMARY_PROVIDER: "google", GOOGLE_GENERATIVE_AI_API_KEY: "k" })).toThrow(
      "AI_PRIMARY_MODEL",
    );
    const p = providersFromEnv({
      AI_PRIMARY_PROVIDER: "google",
      AI_PRIMARY_MODEL: "gemini-3.5-flash-lite",
      GOOGLE_GENERATIVE_AI_API_KEY: "k",
      AI_FALLBACK_PROVIDER: "groq",
      AI_FALLBACK_MODEL: "openai/gpt-oss-120b",
    });
    expect(p.primary).toMatchObject({ name: "google", model: "gemini-3.5-flash-lite" });
    expect(p.fallback).toBeNull();
    expect(p.maxInputTokens).toBe(120_000);
  });
});

describe("chamadas HTTP", () => {
  afterEach(() => vi.unstubAllGlobals());
  const request = { system: "S", user: "U", schema: AI_QUESTIONS_JSON, schemaName: "questoes", maxOutputTokens: 500 };

  function stubFetch(status: number, body: unknown) {
    const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  it("Gemini: generateContent com o esquema JSON, a chave no cabeçalho e o texto sem os pensamentos", async () => {
    const fetch = stubFetch(200, {
      candidates: [
        { content: { parts: [{ text: "pensando", thought: true }, { text: '{"a":1}' }] }, finishReason: "STOP" },
      ],
      usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 7, thoughtsTokenCount: 3 },
    });
    const result = await gemini("gemini-3.5-flash-lite", "KEY").generate(request);
    expect(result).toEqual({ text: '{"a":1}', inputTokens: 30, outputTokens: 10 });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    expect(init.headers).toMatchObject({ "x-goog-api-key": "KEY" });
    expect(JSON.parse(init.body as string)).toEqual({
      systemInstruction: { parts: [{ text: "S" }] },
      contents: [{ role: "user", parts: [{ text: "U" }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: AI_QUESTIONS_JSON,
        maxOutputTokens: 500,
      },
    });
  });

  it.each([
    [429, "quota"],
    [503, "unavailable"],
    [403, "config"],
    [413, "too_large"],
  ])("HTTP %i vira %s", async (status, kind) => {
    stubFetch(status, { error: { message: "x" } });
    await expect(gemini("m", "k").generate(request)).rejects.toMatchObject({ kind });
  });

  it("Gemini: resposta cortada não é aceita", async () => {
    stubFetch(200, { candidates: [{ content: { parts: [{ text: '{"a":' }] }, finishReason: "MAX_TOKENS" }] });
    await expect(gemini("m", "k").generate(request)).rejects.toMatchObject({ kind: "bad_response" });
  });

  it("Groq: modo estrito com o mesmo esquema", async () => {
    const fetch = stubFetch(200, {
      choices: [{ message: { content: '{"b":2}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 12, completion_tokens: 4 },
    });
    expect(await groq("openai/gpt-oss-120b", "GK", 6000).generate(request)).toEqual({
      text: '{"b":2}',
      inputTokens: 12,
      outputTokens: 4,
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(init.headers).toMatchObject({ Authorization: "Bearer GK" });
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "openai/gpt-oss-120b",
      response_format: {
        type: "json_schema",
        json_schema: { name: "questoes", strict: true, schema: AI_QUESTIONS_JSON },
      },
      max_completion_tokens: 500,
    });
  });
});

describe("cache e mensagens", () => {
  it("a chave não depende da ordem e muda com as opções", async () => {
    const a = { documentId: "a", contentHash: "1", excludedPages: [3, 1] };
    const b = { documentId: "b", contentHash: "2", excludedPages: [] };
    const base = await summaryKey({ sources: [a, b], detail: "medio", focus: null });
    expect(await summaryKey({ sources: [b, { ...a, excludedPages: [1, 3] }], detail: "medio", focus: null })).toBe(
      base,
    );
    expect(await summaryKey({ sources: [a, b], detail: "curto", focus: null })).not.toBe(base);
    expect(await summaryKey({ sources: [{ ...a, excludedPages: [1] }, b], detail: "medio", focus: null })).not.toBe(
      base,
    );
    const q = { sources: [a], counts: { facil: 3, medio: 2 }, types: ["vf", "me"], topics: ["Ossos", "Tecido"] };
    expect(await questionsKey(q)).toBe(
      await questionsKey({ ...q, counts: { medio: 2, facil: 3 }, types: ["me", "vf"], topics: ["tecido", "ossos"] }),
    );
    expect(await questionsKey(q)).not.toBe(await questionsKey({ ...q, counts: { facil: 4, medio: 2 } }));
  });

  it("gerações restantes", () => {
    expect(remainingLabel(3)).toBe("Restam 3 gerações hoje");
    expect(remainingLabel(1)).toBe("Resta 1 geração hoje");
    expect(remainingLabel(0)).toBe("Nenhuma geração restante hoje");
  });
});
