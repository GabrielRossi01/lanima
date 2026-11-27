import { z } from "zod";
import { PAGE_HEIGHT, PAGE_WIDTH, strokeSchema } from "@/lib/ink/strokes";

/**
 * A notebook page (sections 5 and 7.2): its background, the strokes and the elements on it (text
 * boxes and pictures, with their place in page space). Validated when read: rows may come from an
 * older version of the app or another device.
 */

export const PAGE_BACKGROUNDS = ["pontilhado", "pautado", "liso"] as const;
export type PageBackground = (typeof PAGE_BACKGROUNDS)[number];

export const BACKGROUND_LABELS: Record<PageBackground, string> = {
  pontilhado: "Pontilhado",
  pautado: "Pautado",
  liso: "Liso",
};

const place = {
  id: z.string().min(1).max(40),
  x: z
    .number()
    .finite()
    .min(-PAGE_WIDTH)
    .max(PAGE_WIDTH * 2),
  y: z
    .number()
    .finite()
    .min(-PAGE_HEIGHT)
    .max(PAGE_HEIGHT * 2),
  w: z
    .number()
    .positive()
    .max(PAGE_WIDTH * 2),
};

export const textElementSchema = z.object({
  ...place,
  type: z.literal("texto"),
  text: z.string().max(5000),
  /** Font size in page units. */
  size: z.number().min(8).max(80),
});

export const imageElementSchema = z.object({
  ...place,
  type: z.literal("imagem"),
  h: z
    .number()
    .positive()
    .max(PAGE_HEIGHT * 2),
  /** Row of notebook_images (the file is in the "notebook" bucket). */
  imageId: z.uuid(),
});

let seq = 0;
/** A short id for a stroke or an element: unique on this device, and with the time, across devices. */
export const newPageItemId = () => `${Date.now().toString(36)}${(seq++ % 1296).toString(36).padStart(2, "0")}`;

export const elementSchema = z.discriminatedUnion("type", [textElementSchema, imageElementSchema]);
export type PageElement = z.infer<typeof elementSchema>;
export type TextElement = z.infer<typeof textElementSchema>;
export type ImageElement = z.infer<typeof imageElementSchema>;

export const pageContentSchema = z.object({
  position: z.number().int().min(0).max(9999),
  background: z.enum(PAGE_BACKGROUNDS),
  strokes: z.array(strokeSchema).max(20_000),
  elements: z.array(elementSchema).max(500),
});
export type PageContent = z.infer<typeof pageContentSchema>;

export const notebookInfoSchema = z.object({
  subjectId: z.uuid().nullable(),
  title: z.string().trim().min(1).max(200),
  /** Epoch ms. */
  createdAt: z.number(),
});
export type NotebookInfo = z.infer<typeof notebookInfoSchema>;

/** The server's limit for strokes + elements of one page (notebook_pages check). */
export const PAGE_MAX_BYTES = 1_572_864;
/** From here on, "Página cheia: continue numa nova". */
export const PAGE_FULL_RATIO = 0.9;

const encoder = new TextEncoder();

/**
 * Bytes of a value as Postgres writes jsonb as text, which is what the server measures: like JSON,
 * plus a space after each "," and ":" between items.
 */
export function jsonbTextBytes(value: unknown): number {
  if (value === null || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value).length;
  if (typeof value === "string") return encoder.encode(JSON.stringify(value)).length;
  if (Array.isArray(value)) {
    let total = 2 + Math.max(value.length - 1, 0) * 2;
    for (const item of value) total += jsonbTextBytes(item);
    return total;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    let total = 2 + Math.max(entries.length - 1, 0) * 2;
    for (const [key, v] of entries) total += encoder.encode(JSON.stringify(key)).length + 2 + jsonbTextBytes(v);
    return total;
  }
  return 0;
}

export function pageBytes(page: Pick<PageContent, "strokes" | "elements">): number {
  return jsonbTextBytes(page.strokes) + jsonbTextBytes(page.elements);
}

export function isPageFull(page: Pick<PageContent, "strokes" | "elements">): boolean {
  return pageBytes(page) >= PAGE_MAX_BYTES * PAGE_FULL_RATIO;
}

/** The text boxes of a page, in reading order (top to bottom, then left to right). */
export function pageText(elements: readonly PageElement[]): string {
  return elements
    .filter((e): e is TextElement => e.type === "texto" && e.text.trim().length > 0)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((e) => e.text.trim())
    .join("\n\n");
}
