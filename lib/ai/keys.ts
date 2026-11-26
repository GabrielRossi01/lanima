import { sha256 } from "@/lib/files/files";

/**
 * Cache keys (section 7.12): the texts (by their hash) and every option that changes the answer.
 * The same request gives back what was already made, without spending quota.
 */

export interface SourceKey {
  documentId: string;
  contentHash: string;
  excludedPages: readonly number[];
}

function sources(list: readonly SourceKey[]) {
  return [...list]
    .map((s) => ({ d: s.documentId, h: s.contentHash, x: [...s.excludedPages].sort((a, b) => a - b) }))
    .sort((a, b) => a.d.localeCompare(b.d));
}

export function summaryKey(input: { sources: readonly SourceKey[]; detail: string; focus: string | null }) {
  return sha256(
    JSON.stringify({ v: 1, op: "resumo", s: sources(input.sources), d: input.detail, f: input.focus ?? "" }),
  );
}

export function questionsKey(input: {
  sources: readonly SourceKey[];
  counts: Record<string, number | undefined>;
  types: readonly string[];
  topics: readonly string[];
}) {
  return sha256(
    JSON.stringify({
      v: 1,
      op: "questoes",
      s: sources(input.sources),
      c: Object.fromEntries(Object.entries(input.counts).sort()),
      t: [...input.types].sort(),
      p: [...input.topics].map((t) => t.trim().toLowerCase()).sort(),
    }),
  );
}
