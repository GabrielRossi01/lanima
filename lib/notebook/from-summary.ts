import type { SummaryContent, Topic } from "@/lib/ai/schemas";
import { textBoxHeight } from "@/lib/ink/erase";
import { PAGE_HEIGHT } from "@/lib/ink/strokes";
import type { TextElement } from "./model";

/**
 * "Salvar no caderno" (section 7.5): a summary laid out as text boxes on notebook pages, the title,
 * each topic with its points, key terms and points of attention; a block that doesn't fit goes on
 * the next page (a very long one is split by lines). Pure: the screen creates the pages.
 */

const X = 70;
const W = 860;
const TOP = 70;
const BOTTOM = PAGE_HEIGHT - 70;
const GAP = 18;

interface Block {
  text: string;
  size: number;
}

function topicBlocks(topic: Pick<Topic, "titulo" | "pontos">, label: string, headingSize: number): Block[] {
  const blocks: Block[] = [{ text: `${label}${topic.titulo}`, size: headingSize }];
  if (topic.pontos.length > 0) blocks.push({ text: topic.pontos.map((p) => `• ${p.texto}`).join("\n"), size: 21 });
  return blocks;
}

function blocksOf(content: SummaryContent): Block[] {
  const blocks: Block[] = [{ text: content.titulo, size: 34 }];
  content.topicos.forEach((topic, i) => {
    blocks.push(...topicBlocks(topic, `${i + 1}. `, 26));
    for (const sub of topic.subtopicos ?? []) blocks.push(...topicBlocks(sub, "", 23));
  });
  if (content.termosChave.length > 0) {
    blocks.push({ text: "Termos-chave", size: 26 });
    blocks.push({ text: content.termosChave.map((t) => `• ${t.termo}: ${t.definicao}`).join("\n"), size: 21 });
  }
  if (content.pontosDeAtencao.length > 0) {
    blocks.push({ text: "Pontos de atenção", size: 26 });
    blocks.push({ text: content.pontosDeAtencao.map((p) => `• ${p}`).join("\n"), size: 21 });
  }
  return blocks;
}

const box = (id: string, y: number, block: Block): TextElement => ({
  id,
  type: "texto",
  x: X,
  y: Math.round(y * 10) / 10,
  w: W,
  text: block.text.slice(0, 5000),
  size: block.size,
});

/** The text boxes of each page, in order. `newId` gives each box its id. */
export function summaryToPages(content: SummaryContent, newId: () => string): TextElement[][] {
  const pages: TextElement[][] = [[]];
  let y = TOP;
  const place = (block: Block) => {
    const height = textBoxHeight(box("", 0, block));
    if (y + height > BOTTOM && pages[pages.length - 1].length > 0) {
      pages.push([]);
      y = TOP;
    }
    pages[pages.length - 1].push(box(newId(), y, block));
    y += height + GAP;
  };
  for (const block of blocksOf(content)) {
    // Taller than a page (or than 5,000 characters): split by its lines.
    const whole = box("", 0, block);
    if (textBoxHeight(whole) <= BOTTOM - TOP && block.text.length <= 5000) {
      place(block);
      continue;
    }
    let part: string[] = [];
    for (const line of block.text.split("\n")) {
      const next = [...part, line];
      const candidate = { text: next.join("\n"), size: block.size };
      if (part.length > 0 && (textBoxHeight(box("", 0, candidate)) > BOTTOM - TOP || candidate.text.length > 5000)) {
        place({ text: part.join("\n"), size: block.size });
        part = [line];
      } else {
        part = next;
      }
    }
    if (part.length > 0) place({ text: part.join("\n"), size: block.size });
  }
  return pages;
}
