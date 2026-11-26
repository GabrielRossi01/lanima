import type { ProviderRequest, ProviderResult } from "./providers";
import { DIFFICULTIES, type Difficulty, type QuestionType } from "./schemas";

/**
 * The simulated provider of the automated tests (section 7.12): reads the "PEDIDO" line and the
 * "[D1 p.3]" chunks of the request and answers in the requested format, citing real pages. It is
 * deterministic, so the E2E can check exact texts.
 */

interface MockChunk {
  doc: string;
  page: number;
  text: string;
}

function parseRequest(user: string): { pedido: Record<string, unknown>; chunks: MockChunk[] } {
  const line = user.match(/^PEDIDO: (.*)$/m);
  const pedido = line ? (JSON.parse(line[1]) as Record<string, unknown>) : {};
  const chunks: MockChunk[] = [];
  const re = /\[(D\d+) p\.(\d+)\]\n([\s\S]*?)(?=\n\n\[D\d+ p\.\d+\]|\n\n=== D\d+|$)/g;
  for (const m of user.matchAll(re)) chunks.push({ doc: m[1], page: Number(m[2]), text: m[3].trim() });
  return { pedido, chunks };
}

/** Sentences of a chunk, without its first line (a title, on slides). */
function sentences(text: string): string[] {
  const lines = text.split("\n");
  const body = (lines.length > 1 ? lines.slice(1) : lines).join(" ");
  return body
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

const titleOf = (chunk: MockChunk) => chunk.text.split("\n")[0].slice(0, 80);

function summary(chunks: MockChunk[], detail: string) {
  const perTopic = detail === "curto" ? 2 : detail === "medio" ? 3 : 5;
  const pages = chunks.slice(0, detail === "curto" ? 4 : 12);
  const topicos = pages.map((chunk) => ({
    titulo: titleOf(chunk),
    pontos: sentences(chunk.text)
      .slice(0, perTopic)
      .map((texto) => ({ texto, doc: chunk.doc, pagina: chunk.page })),
    subtopicos: [],
  }));
  return {
    titulo: titleOf(chunks[0] ?? { doc: "D1", page: 1, text: "Resumo" }),
    topicos,
    termosChave: pages.slice(0, 3).map((chunk) => ({
      termo: titleOf(chunk),
      definicao: sentences(chunk.text)[0] ?? titleOf(chunk),
    })),
    pontosDeAtencao: pages.slice(0, 2).map((chunk) => ({
      texto: `Atenção: ${sentences(chunk.text).at(-1) ?? titleOf(chunk)}`,
      doc: chunk.doc,
      pagina: chunk.page,
    })),
  };
}

function merge(user: string) {
  const json = user.slice(user.indexOf("RESUMOS PARCIAIS (JSON):") + "RESUMOS PARCIAIS (JSON):".length);
  const partials = JSON.parse(json) as ReturnType<typeof summary>[];
  return {
    titulo: partials[0]?.titulo ?? "Resumo",
    topicos: partials.flatMap((p) => p.topicos),
    termosChave: partials.flatMap((p) => p.termosChave),
    pontosDeAtencao: partials.flatMap((p) => p.pontosDeAtencao),
  };
}

/** Words that make each simulated statement different from the others. */
const TAGS =
  "alfa beta gama delta épsilon zeta eta teta iota capa lambda mi ni ômicron pi rô sigma tau ípsilon fi qui psi ômega".split(
    " ",
  );
const tagOf = (n: number) => `${TAGS[n % TAGS.length]} ${TAGS[Math.floor(n / TAGS.length) % TAGS.length]}`;

const NULLS = { alternativas: null, correta: null, verdadeiro: null, pares: null, respostaEsperada: null };

function questions(chunks: MockChunk[], pedido: Record<string, unknown>) {
  const counts = (pedido.quantidades ?? {}) as Partial<Record<Difficulty, number>>;
  const types = ((pedido.tipos as QuestionType[] | undefined) ?? ["multipla_escolha"]).slice();
  const topics = (pedido.topicos as string[] | undefined) ?? [];
  const facts = chunks.flatMap((chunk) => sentences(chunk.text).map((s) => ({ chunk, s })));
  const out: Record<string, unknown>[] = [];
  // Numbered after the ones she has: a second request writes new questions, as a model would.
  let n = Number(pedido.jaTem ?? 0);
  for (const level of DIFFICULTIES) {
    for (let i = 0; i < (counts[level] ?? 0); i++, n++) {
      const fact = facts[n % facts.length];
      const type = types[n % types.length];
      const topico = topics.length ? topics[n % topics.length] : titleOf(fact.chunk);
      const base = {
        topico,
        dificuldade: level,
        tipo: type,
        explicacao: `O material afirma: ${fact.s}`,
        doc: fact.chunk.doc,
        pagina: fact.chunk.page,
        trecho: fact.s.slice(0, 200),
      };
      const others = facts.filter((f) => f.s !== fact.s);
      const pick = (k: number) => others[(n + k * 3) % Math.max(others.length, 1)]?.s ?? `Distrator ${k}`;
      const label = `Questão ${n + 1} (${level}, ${tagOf(n)})`;
      if (type === "multipla_escolha" || type === "caso_clinico") {
        const wrong = [pick(1), pick(2), pick(3)].map((s, k) => `${s.replace(/\.$/, "")} — opção ${k + 1}.`);
        const correta = n % 4;
        const alternativas = [...wrong];
        alternativas.splice(correta, 0, fact.s);
        out.push({
          ...base,
          ...NULLS,
          enunciado:
            type === "caso_clinico"
              ? `${label}: Paciente em acompanhamento; sobre ${topico}, qual afirmação o material sustenta?`
              : `${label}: Sobre ${topico}, qual afirmação está correta segundo o material?`,
          alternativas,
          correta,
        });
      } else if (type === "verdadeiro_falso") {
        out.push({ ...base, ...NULLS, enunciado: `${label}: ${fact.s}`, verdadeiro: true });
      } else if (type === "associacao") {
        const trio = [
          fact,
          ...others.slice(n % Math.max(others.length - 2, 1), (n % Math.max(others.length - 2, 1)) + 2),
        ];
        const pares = trio.map((f, k) => ({ esquerda: `Item ${k + 1} de ${label}`, direita: f.s.slice(0, 90) }));
        while (pares.length < 3)
          pares.push({ esquerda: `Item ${pares.length + 1} de ${label}`, direita: `Complemento ${pares.length + 1}` });
        out.push({ ...base, ...NULLS, enunciado: `${label}: Associe cada item à afirmação do material.`, pares });
      } else {
        out.push({
          ...base,
          ...NULLS,
          enunciado: `${label}: Explique, com base no material, ${titleOf(fact.chunk).toLowerCase()}.`,
          respostaEsperada: fact.s,
        });
      }
    }
  }
  return { questoes: out };
}

export function mockGenerate(request: ProviderRequest): ProviderResult {
  const { pedido, chunks } = parseRequest(request.user);
  let answer: unknown;
  if (pedido.tipo === "juntar") answer = merge(request.user);
  else if (pedido.tipo === "questoes") answer = questions(chunks, pedido);
  else answer = summary(chunks, String(pedido.detalhe ?? "medio"));
  const text = JSON.stringify(answer);
  return { text, inputTokens: Math.ceil(request.user.length / 4), outputTokens: Math.ceil(text.length / 4) };
}
