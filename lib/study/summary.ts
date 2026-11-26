import { HIGHLIGHTS, type Point, type SummaryContent, type Topic } from "@/lib/ai/schemas";

/**
 * Editing a summary (section 7.5): each point can be edited, deleted, moved or highlighted, and
 * points and topics can be added by hand. Pure functions over the saved content; the screen saves
 * the result and marks the summary as edited by her.
 */

export type Highlight = (typeof HIGHLIGHTS)[number];

/** Where a point lives: topic index, subtopic index (or null), point index. */
export interface PointPath {
  topic: number;
  sub: number | null;
  point: number;
}

function listAt(content: SummaryContent, topic: number, sub: number | null): Point[] {
  const t = content.topicos[topic];
  return sub === null ? t.pontos : (t.subtopicos ?? [])[sub].pontos;
}

function withList(content: SummaryContent, topic: number, sub: number | null, list: Point[]): SummaryContent {
  return {
    ...content,
    topicos: content.topicos.map((t, i) => {
      if (i !== topic) return t;
      if (sub === null) return { ...t, pontos: list };
      return { ...t, subtopicos: (t.subtopicos ?? []).map((s, j) => (j === sub ? { ...s, pontos: list } : s)) };
    }),
  };
}

export function updatePoint(
  content: SummaryContent,
  path: PointPath,
  change: Partial<Pick<Point, "texto" | "destaque">>,
) {
  const list = listAt(content, path.topic, path.sub).map((p, i) => (i === path.point ? { ...p, ...change } : p));
  return withList(content, path.topic, path.sub, list);
}

export function deletePoint(content: SummaryContent, path: PointPath) {
  const list = listAt(content, path.topic, path.sub).filter((_, i) => i !== path.point);
  return withList(content, path.topic, path.sub, list);
}

/** Moves a point inside its list (drag to reorder). */
export function movePoint(content: SummaryContent, path: PointPath, to: number) {
  const list = [...listAt(content, path.topic, path.sub)];
  const [point] = list.splice(path.point, 1);
  list.splice(Math.max(0, Math.min(to, list.length)), 0, point);
  return withList(content, path.topic, path.sub, list);
}

function nextId(content: SummaryContent, prefix: "p" | "t"): string {
  const used = new Set<string>();
  for (const t of content.topicos) {
    used.add(t.id);
    for (const p of t.pontos) used.add(p.id);
    for (const s of t.subtopicos ?? []) {
      used.add(s.id);
      for (const p of s.pontos) used.add(p.id);
    }
  }
  let n = used.size;
  while (used.has(`${prefix}m${n.toString(36)}`)) n++;
  return `${prefix}m${n.toString(36)}`;
}

/** A point written by hand: no source. */
export function addPoint(content: SummaryContent, topic: number, sub: number | null, texto: string) {
  const point: Point = { id: nextId(content, "p"), texto: texto.trim(), fonte: null };
  return withList(content, topic, sub, [...listAt(content, topic, sub), point]);
}

export function addTopic(content: SummaryContent, titulo: string): SummaryContent {
  const topic: Topic = { id: nextId(content, "t"), titulo: titulo.trim(), pontos: [] };
  return { ...content, topicos: [...content.topicos, topic] };
}

export function renameTopic(content: SummaryContent, topic: number, titulo: string): SummaryContent {
  return { ...content, topicos: content.topicos.map((t, i) => (i === topic ? { ...t, titulo: titulo.trim() } : t)) };
}

export function deleteTopic(content: SummaryContent, topic: number): SummaryContent {
  return { ...content, topicos: content.topicos.filter((_, i) => i !== topic) };
}

/** Points of a topic, its subtopics included. */
export function pointCount(topic: Topic): number {
  return topic.pontos.length + (topic.subtopicos ?? []).reduce((sum, s) => sum + s.pontos.length, 0);
}

/** "4 pontos", "1 ponto". */
export function pointsLabel(n: number): string {
  return n === 1 ? "1 ponto" : `${n} pontos`;
}

/** "1.2", "1.1.3": the numbering of the accordion. */
export function pointNumber(path: PointPath): string {
  return path.sub === null
    ? `${path.topic + 1}.${path.point + 1}`
    : `${path.topic + 1}.${path.sub + 1}.${path.point + 1}`;
}

/** The pages a summary cites for each topic: the questions of that topic use them first. */
export function topicPages(
  content: SummaryContent,
): { title: string; pages: { documentId: string; page: number }[] }[] {
  return content.topicos.map((t) => {
    const all = [...t.pontos, ...(t.subtopicos ?? []).flatMap((s) => s.pontos)];
    const seen = new Set<string>();
    const pages: { documentId: string; page: number }[] = [];
    for (const p of all) {
      if (!p.fonte) continue;
      const key = `${p.fonte.documentId}:${p.fonte.pagina}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pages.push({ documentId: p.fonte.documentId, page: p.fonte.pagina });
    }
    return { title: t.titulo, pages };
  });
}
