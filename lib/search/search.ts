/** Lowercase without accents: "Bioquímica" → "bioquimica". */
export function normalizeText(text: string): string {
  // NFD splits "í" into "i" + a combining accent (Unicode category M), which is then removed.
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").trim();
}

export type SearchKind = "materia" | "topico" | "avaliacao" | "meta";

export interface SearchItem {
  kind: SearchKind;
  id: string;
  title: string;
  /** Context shown under the title ("Anatomia Humana · tópico"). */
  detail: string;
  href: string;
}

export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  materia: "Matérias",
  topico: "Conteúdo",
  avaliacao: "Avaliações",
  meta: "Metas",
};

/**
 * Every word of the query must appear in the title or the detail (any order, accents ignored).
 * Titles that start with the query rank first. Up to `limit` results per kind.
 */
export function searchItems(items: readonly SearchItem[], query: string, limit = 5): SearchItem[] {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const first = words.join(" ");
  const scored = items
    .map((item) => {
      const title = normalizeText(item.title);
      const haystack = `${title} ${normalizeText(item.detail)}`;
      if (!words.every((w) => haystack.includes(w))) return null;
      return { item, score: title.startsWith(first) ? 0 : title.includes(first) ? 1 : 2 };
    })
    .filter((x): x is { item: SearchItem; score: number } => x !== null)
    .sort((a, b) => a.score - b.score || a.item.title.localeCompare(b.item.title, "pt-BR"));

  const perKind = new Map<SearchKind, number>();
  const out: SearchItem[] = [];
  for (const { item } of scored) {
    const n = perKind.get(item.kind) ?? 0;
    if (n >= limit) continue;
    perKind.set(item.kind, n + 1);
    out.push(item);
  }
  return out;
}
