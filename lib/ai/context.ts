/**
 * The text sent to the AI (section 7.12): only the chunks of the chosen documents, without the
 * pages she left out, each marked with a short label and its page ("[D1 p.3]"), so every point and
 * every question can cite where it came from. Nothing about her profile goes along.
 */

export interface SourceDocument {
  id: string;
  /** File name, to help the model tell the documents apart. */
  name: string;
  excludedPages: readonly number[];
  chunks: readonly { page: number; position: number; text: string }[];
}

export interface ContextChunk {
  label: string;
  documentId: string;
  page: number;
  text: string;
}

export interface Context {
  /** "D1" → document id. */
  labels: Map<string, string>;
  names: Map<string, string>;
  chunks: ContextChunk[];
}

/** Portuguese runs at about 3.5 characters per token; a bit pessimistic, on purpose. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

export function buildContext(documents: readonly SourceDocument[]): Context {
  const labels = new Map<string, string>();
  const names = new Map<string, string>();
  const chunks: ContextChunk[] = [];
  documents.forEach((doc, i) => {
    const label = `D${i + 1}`;
    labels.set(label, doc.id);
    names.set(label, doc.name);
    const excluded = new Set(doc.excludedPages);
    for (const chunk of [...doc.chunks].sort((a, b) => a.position - b.position)) {
      if (excluded.has(chunk.page) || !chunk.text.trim()) continue;
      chunks.push({ label, documentId: doc.id, page: chunk.page, text: chunk.text });
    }
  });
  return { labels, names, chunks };
}

/** The chunks as the model reads them, grouped by document. */
export function renderChunks(context: Context, chunks: readonly ContextChunk[] = context.chunks): string {
  const parts: string[] = [];
  let current = "";
  for (const chunk of chunks) {
    if (chunk.label !== current) {
      current = chunk.label;
      parts.push(`=== ${chunk.label}: ${JSON.stringify(context.names.get(chunk.label) ?? "")} ===`);
    }
    parts.push(`[${chunk.label} p.${chunk.page}]\n${chunk.text}`);
  }
  return parts.join("\n\n");
}

/** Where a cited page points to, if it was really sent; null drops the item (section 7.12). */
export function resolveSource(
  sent: readonly ContextChunk[],
  doc: string,
  page: number,
): { documentId: string; page: number } | null {
  const label = doc.trim().toUpperCase();
  const hit = sent.find((c) => c.label === label && c.page === page);
  return hit ? { documentId: hit.documentId, page } : null;
}

/** Groups of chunks of up to `maxTokens` each, in order (the "map" of a map-reduce summary). */
export function splitByTokens(chunks: readonly ContextChunk[], maxTokens: number): ContextChunk[][] {
  const groups: ContextChunk[][] = [];
  let group: ContextChunk[] = [];
  let size = 0;
  for (const chunk of chunks) {
    const tokens = estimateTokens(chunk.text) + 8;
    if (group.length > 0 && size + tokens > maxTokens) {
      groups.push(group);
      group = [];
      size = 0;
    }
    group.push(chunk);
    size += tokens;
  }
  if (group.length > 0) groups.push(group);
  return groups;
}

/** Lowercase, no accents, no punctuation: for comparing words. */
export function normalizeWords(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  "a o as os de da do das dos e em no na nos nas um uma uns umas para por com sem que se ao aos sua seu suas seus".split(
    " ",
  ),
);

function keywords(text: string): string[] {
  return normalizeWords(text)
    .split(" ")
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * The chunks that matter for the topics, within `maxTokens` (section 7.12: "envie só os trechos
 * relevantes de cada tópico"). Pages cited by the summary for a topic come first, then pages that
 * mention its words; without topics, or when nothing matches, pages spread over the whole material.
 */
export function selectForTopics(
  chunks: readonly ContextChunk[],
  topics: readonly { title: string; pages?: readonly { documentId: string; page: number }[] }[],
  maxTokens: number,
): ContextChunk[] {
  const fits = (list: readonly ContextChunk[]) =>
    list.reduce((sum, c) => sum + estimateTokens(c.text) + 8, 0) <= maxTokens;
  if (fits(chunks)) return [...chunks];

  const score = new Map<ContextChunk, number>();
  for (const topic of topics) {
    const words = keywords(topic.title);
    for (const chunk of chunks) {
      let s = 0;
      if (topic.pages?.some((p) => p.documentId === chunk.documentId && p.page === chunk.page)) s += 100;
      const text = ` ${normalizeWords(chunk.text)} `;
      for (const w of words) if (text.includes(` ${w}`)) s += 1;
      if (s > 0) score.set(chunk, (score.get(chunk) ?? 0) + s);
    }
  }
  const ranked = [...chunks].sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0));
  const scored = ranked.filter((c) => (score.get(c) ?? 0) > 0);
  // Nothing matched: every n-th chunk, so the whole material is represented.
  const pool = scored.length > 0 ? ranked : spread(chunks);
  const picked = new Set<ContextChunk>();
  let size = 0;
  for (const chunk of pool) {
    const tokens = estimateTokens(chunk.text) + 8;
    if (size + tokens > maxTokens) continue;
    picked.add(chunk);
    size += tokens;
  }
  return chunks.filter((c) => picked.has(c));
}

function spread<T>(list: readonly T[]): T[] {
  // 0, n/2, n/4, 3n/4…: an order that covers the list evenly as it is cut short.
  const order: T[] = [];
  const seen = new Set<number>();
  for (let step = list.length; step >= 1; step = Math.floor(step / 2)) {
    for (let i = 0; i < list.length; i += step) {
      if (!seen.has(i)) {
        seen.add(i);
        order.push(list[i]);
      }
    }
    if (step === 1) break;
  }
  return order;
}
