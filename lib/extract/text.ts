/**
 * The text read from a file, page by page, and its chunks (section 5: `document_chunks`). Each
 * chunk comes from one page, so a summary point or a question can always cite its page.
 */
export interface PageText {
  /** 1-based: page of the PDF, slide number, or block of a Word file without page marks. */
  page: number;
  text: string;
}

export interface Reading {
  pages: PageText[];
  /** Pages of the file, with or without text. */
  pageCount: number;
  /** Word without page marks: the pages are estimated ("pág. ≈2"). */
  pagesApprox: boolean;
  usedOcr: boolean;
}

export interface Chunk {
  position: number;
  page: number;
  text: string;
}

/** About 1,500 tokens: Portuguese runs at roughly 4 characters per token. */
export const CHUNK_CHARS = 6000;

/** Tidy text: one space between words, no blank lines in a row, no control characters. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f­￾￿]/g, "")
    .replace(/[\t  -​  　]+/g, " ")
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Letters and digits: what makes text readable, as opposed to stray marks. */
export function readableChars(text: string): number {
  return text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
}

/** Fewer letters than this on a PDF page means it is a picture of text: it goes to OCR. */
export const MIN_PAGE_CHARS = 20;

export function hasText(text: string, min = 1): boolean {
  return readableChars(text) >= min;
}

/** Splits a long text into parts of up to `max`, at paragraph, line, sentence or word ends. */
export function splitText(text: string, max = CHUNK_CHARS): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max + 1);
    const cut =
      lastBreak(window, "\n\n", max) ??
      lastBreak(window, "\n", max) ??
      lastSentence(window, max) ??
      lastBreak(window, " ", max) ??
      max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts.filter(Boolean);
}

/** The last `separator` in the second half of the window, so the parts don't get tiny. */
function lastBreak(window: string, separator: string, max: number): number | null {
  const at = window.lastIndexOf(separator, max);
  return at >= max / 2 ? at + separator.length : null;
}

function lastSentence(window: string, max: number): number | null {
  let found: number | null = null;
  for (const match of window.matchAll(/[.!?;:](?=\s)/g)) {
    if (match.index !== undefined && match.index < max && match.index >= max / 2) found = match.index + 1;
  }
  return found;
}

/** Chunks of every page with text, in order. */
export function chunkPages(pages: readonly PageText[], max = CHUNK_CHARS): Chunk[] {
  const chunks: Chunk[] = [];
  for (const { page, text } of pages) {
    const clean = normalizeText(text);
    if (!hasText(clean)) continue;
    for (const part of splitText(clean, max)) chunks.push({ position: chunks.length, page, text: part });
  }
  return chunks;
}

/** What is hashed for `content_hash`: the text and its pages, so the same reading has the same hash. */
export function hashInput(chunks: readonly Chunk[]): string {
  return chunks.map((c) => `[${c.page}]\n${c.text}`).join("\n\n");
}

/** "Página 3", "Slide 3", "pág. ≈3". */
export function pageLabel(page: number, { kind, approx }: { kind: string; approx: boolean }): string {
  if (approx) return `Pág. ≈${page}`;
  if (kind === "slides") return `Slide ${page}`;
  if (kind === "foto") return "Foto";
  return `Página ${page}`;
}
