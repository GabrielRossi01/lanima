import { normalizeWords, resolveSource, type ContextChunk } from "./context";
import type { AiQuestion, AiSummary, Difficulty, QuestionDraft, QuestionType, SummaryContent, Topic } from "./schemas";

/**
 * Turns what the AI answered into what is saved, keeping only what the rules of section 7.12
 * allow: every point and question cites a page that was really sent; questions have exactly one
 * right answer, plausible options, a short explanation and no "todas/nenhuma das anteriores".
 */

/** Stable, short ids for the points and topics (so edits and highlights can point at them). */
export function makeIds(prefix: string) {
  let n = 0;
  return () => `${prefix}${(n++).toString(36)}`;
}

export function toSummaryContent(ai: AiSummary, sent: readonly ContextChunk[]): SummaryContent | null {
  const nextTopic = makeIds("t");
  const nextPoint = makeIds("p");
  const points = (list: AiSummary["topicos"][number]["pontos"]) =>
    list.flatMap((p) => {
      const source = resolveSource(sent, p.doc, p.pagina);
      const texto = p.texto.trim();
      if (!source || !texto) return [];
      return [
        { id: nextPoint(), texto: texto.slice(0, 1500), fonte: { documentId: source.documentId, pagina: source.page } },
      ];
    });

  const topicos: Topic[] = [];
  for (const topic of ai.topicos) {
    const id = nextTopic();
    const own = points(topic.pontos);
    const subtopicos = topic.subtopicos
      .map((s) => ({ id: nextTopic(), titulo: s.titulo.trim().slice(0, 200), pontos: points(s.pontos) }))
      .filter((s) => s.titulo && s.pontos.length > 0);
    const titulo = topic.titulo.trim().slice(0, 200);
    if (!titulo || (own.length === 0 && subtopicos.length === 0)) continue;
    topicos.push({ id, titulo, pontos: own, ...(subtopicos.length ? { subtopicos } : {}) });
  }
  if (topicos.length === 0) return null;

  const seenTerms = new Set<string>();
  const termosChave = ai.termosChave
    .map((t) => ({ termo: t.termo.trim().slice(0, 120), definicao: t.definicao.trim().slice(0, 600) }))
    .filter((t) => {
      const key = normalizeWords(t.termo);
      if (!t.termo || !t.definicao || seenTerms.has(key)) return false;
      seenTerms.add(key);
      return true;
    });
  // "Desde que estejam no material": only the ones that cite a page that was sent.
  const pontosDeAtencao = ai.pontosDeAtencao
    .filter((p) => resolveSource(sent, p.doc, p.pagina) && p.texto.trim())
    .map((p) => p.texto.trim().slice(0, 600));

  return {
    titulo: ai.titulo.trim().slice(0, 200) || topicos[0].titulo,
    topicos: topicos.slice(0, 40),
    termosChave: termosChave.slice(0, 60),
    pontosDeAtencao: pontosDeAtencao.slice(0, 30),
  };
}

const BANNED_OPTION = /\b(todas|nenhuma) (as|das) (anteriores|alternativas|acima)\b/;

/** 1 to 3 sentences (section 7.12). */
export function sentenceCount(text: string): number {
  return text
    .replace(/\b(ex|p|pág|fig|dr|dra|sr|sra)\./gi, "$1")
    .split(/[.!?]+(?:\s|$)/)
    .filter((s) => s.trim().length > 0).length;
}

/** Deterministic shuffle (the right column of a matching question must not come in order). */
export function permutation(n: number, seed: string): number[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  // Never the identity: then every pair would sit side by side.
  if (n > 1 && order.every((v, i) => v === i)) order.push(order.shift()!);
  return order;
}

export type Rejection =
  | "sem_fonte"
  | "enunciado"
  | "alternativas"
  | "gabarito"
  | "explicacao"
  | "anteriores"
  | "pares"
  | "resposta"
  | "tipo_nao_pedido"
  | "nivel_nao_pedido";

export function toQuestionDraft(
  q: AiQuestion,
  sent: readonly ContextChunk[],
  allowed: { types: readonly QuestionType[]; difficulties: readonly Difficulty[] },
): QuestionDraft | Rejection {
  const source = resolveSource(sent, q.doc, q.pagina);
  if (!source) return "sem_fonte";
  if (!allowed.types.includes(q.tipo)) return "tipo_nao_pedido";
  if (!allowed.difficulties.includes(q.dificuldade)) return "nivel_nao_pedido";
  const statement = q.enunciado.trim();
  if (statement.length < 10 || statement.length > 4000) return "enunciado";
  const explanation = q.explicacao.trim();
  if (!explanation || explanation.length > 700 || sentenceCount(explanation) > 3) return "explicacao";

  const base = {
    topic: (q.topico.trim() || "Geral").slice(0, 120),
    difficulty: q.dificuldade,
    type: q.tipo,
    statement,
    explanation,
    source: { documentId: source.documentId, page: source.page, excerpt: q.trecho.trim().slice(0, 300) },
  };

  switch (q.tipo) {
    case "multipla_escolha":
    case "caso_clinico": {
      const options = (q.alternativas ?? []).map((o) => o.trim());
      const distinct = new Set(options.map(normalizeWords));
      if (options.length < 4 || options.length > 5 || options.some((o) => !o) || distinct.size !== options.length)
        return "alternativas";
      if (options.some((o) => BANNED_OPTION.test(normalizeWords(o)))) return "anteriores";
      if (q.correta === null || !Number.isInteger(q.correta) || q.correta < 0 || q.correta >= options.length)
        return "gabarito";
      return { ...base, options, answer: { index: q.correta } };
    }
    case "verdadeiro_falso":
      if (q.verdadeiro === null) return "gabarito";
      return { ...base, options: null, answer: { value: q.verdadeiro } };
    case "associacao": {
      const pairs = (q.pares ?? []).map((p) => ({ left: p.esquerda.trim(), right: p.direita.trim() }));
      const lefts = new Set(pairs.map((p) => normalizeWords(p.left)));
      const rights = new Set(pairs.map((p) => normalizeWords(p.right)));
      if (pairs.length < 3 || pairs.length > 6 || pairs.some((p) => !p.left || !p.right)) return "pares";
      if (lefts.size !== pairs.length || rights.size !== pairs.length) return "pares";
      const order = permutation(pairs.length, statement);
      const right = order.map((i) => pairs[i].right);
      // Left item i goes with the right item that came from pair i.
      const match = pairs.map((_, i) => order.indexOf(i));
      return { ...base, options: { left: pairs.map((p) => p.left), right }, answer: { match } };
    }
    case "resposta_curta": {
      const text = (q.respostaEsperada ?? "").trim();
      if (!text || text.length > 600) return "resposta";
      return { ...base, options: null, answer: { text } };
    }
  }
}

/** Words of a statement, for comparing questions. */
function wordSet(text: string): Set<string> {
  return new Set(normalizeWords(text).split(" ").filter(Boolean));
}

/** Same or almost the same question (section 7.12): equal text, or 85% of the words in common. */
export function isNearDuplicate(a: string, b: string): boolean {
  const na = normalizeWords(a);
  const nb = normalizeWords(b);
  if (na === nb) return true;
  const wa = wordSet(a);
  const wb = wordSet(b);
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  const union = wa.size + wb.size - common;
  return union > 0 && common / union >= 0.85;
}

/** Drops duplicates within the list and of the statements already in her bank. */
export function dedupe<T extends { statement: string }>(list: readonly T[], existing: readonly string[] = []): T[] {
  const kept: T[] = [];
  for (const item of list) {
    if (existing.some((s) => isNearDuplicate(s, item.statement))) continue;
    if (kept.some((k) => isNearDuplicate(k.statement, item.statement))) continue;
    kept.push(item);
  }
  return kept;
}
