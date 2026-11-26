import JSZip from "jszip";
import { normalizeText, readableChars, type PageText, type Reading } from "./text";

/**
 * Word (.docx). The XML is read directly, not with mammoth, because mammoth drops the page marks:
 * Word saves one (`w:lastRenderedPageBreak`) where each page started the last time it laid the
 * document out, so the pages here are the ones she saw. Files without them (exported from Google
 * Docs, for example) are split into blocks of about the same size, as many as the pages the file
 * declares, and marked as approximate.
 */
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";

/** Block size when the file says nothing about its pages. */
export const APPROX_PAGE_CHARS = 3000;

interface Paragraph {
  text: string;
  /** A page starts before this paragraph's text (rendered mark or hard break). */
  breaksBefore: boolean;
}

function parse(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) throw new Error("docx: XML inválido");
  return doc;
}

function isOn(element: Element): boolean {
  const value = element.getAttributeNS(W, "val");
  return value === null || !["0", "false", "off"].includes(value);
}

/**
 * Paragraphs of the body, in order, with the page marks. Inside a paragraph, a mark in the middle
 * splits it: the text after it belongs to the next page.
 */
function paragraphsOf(body: Element): { paragraphs: Paragraph[]; rendered: boolean } {
  const paragraphs: Paragraph[] = [];
  let rendered = false;
  let current: Paragraph = { text: "", breaksBefore: false };
  let pending = false;

  const flush = () => {
    if (current.text || current.breaksBefore) paragraphs.push(current);
    current = { text: "", breaksBefore: false };
  };
  const pageBreak = () => {
    if (readableChars(current.text) > 0) {
      flush();
      current.breaksBefore = true;
    } else {
      pending = true;
    }
  };
  const write = (text: string) => {
    if (pending && readableChars(text) > 0) {
      current.breaksBefore = true;
      pending = false;
    }
    current.text += text;
  };

  const walk = (node: Element) => {
    if (node.namespaceURI === MC && node.localName === "Fallback") return; // A copy of mc:Choice.
    if (node.namespaceURI === W) {
      switch (node.localName) {
        case "del":
        case "instrText":
        case "delText":
          return;
        case "t":
          write(node.textContent ?? "");
          return;
        case "tab":
        case "ptab":
          write(" ");
          return;
        case "noBreakHyphen":
          write("-");
          return;
        case "cr":
          write("\n");
          return;
        case "br":
          if (node.getAttributeNS(W, "type") === "page") pageBreak();
          else write("\n");
          return;
        case "lastRenderedPageBreak":
          rendered = true;
          pageBreak();
          return;
        case "pageBreakBefore":
          if (isOn(node)) pageBreak();
          return;
      }
    }
    for (const child of Array.from(node.children)) walk(child);
    if (node.namespaceURI === W && node.localName === "p") {
      current.text += "\n";
      flush();
    }
  };
  walk(body);
  flush();
  return { paragraphs, rendered };
}

/** Pages from the marks Word saved. */
function byMarks(paragraphs: readonly Paragraph[]): string[] {
  const pages: string[] = [""];
  for (const p of paragraphs) {
    if (p.breaksBefore && readableChars(pages[pages.length - 1]) > 0) pages.push("");
    pages[pages.length - 1] += p.text;
  }
  return pages;
}

/** Blocks of about `size` characters, at paragraph ends. */
function byBlocks(paragraphs: readonly Paragraph[], size: number): string[] {
  const pages: string[] = [""];
  for (const p of paragraphs) {
    const last = pages[pages.length - 1];
    if (last.length > 0 && last.length + p.text.length > size) pages.push("");
    pages[pages.length - 1] += p.text;
  }
  return pages;
}

/** Exactly up to `count` blocks of about the same size: each paragraph goes where its middle falls. */
function intoBlocks(paragraphs: readonly Paragraph[], count: number): string[] {
  const total = paragraphs.reduce((sum, p) => sum + p.text.length, 0) || 1;
  const pages: string[] = [];
  let offset = 0;
  for (const p of paragraphs) {
    const block = Math.min(count - 1, Math.floor(((offset + p.text.length / 2) / total) * count));
    while (pages.length <= block) pages.push("");
    pages[block] += p.text;
    offset += p.text.length;
  }
  return pages.filter((text) => text.length > 0);
}

/** Number of pages Word wrote in docProps/app.xml, if any. */
async function declaredPages(zip: JSZip): Promise<number | null> {
  const xml = await zip.file("docProps/app.xml")?.async("string");
  if (!xml) return null;
  const pages = Number(parse(xml).getElementsByTagName("Pages")[0]?.textContent);
  return Number.isInteger(pages) && pages > 0 ? pages : null;
}

export async function readDocx(data: ArrayBuffer | Uint8Array): Promise<Reading> {
  const zip = await JSZip.loadAsync(data);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("docx: sem word/document.xml");
  const body = parse(xml).getElementsByTagNameNS(W, "body")[0];
  if (!body) throw new Error("docx: sem corpo");
  const { paragraphs, rendered } = paragraphsOf(body);

  let texts: string[];
  let approx = false;
  if (rendered) {
    texts = byMarks(paragraphs);
  } else {
    const declared = await declaredPages(zip);
    texts = declared ? intoBlocks(paragraphs, declared) : byBlocks(paragraphs, APPROX_PAGE_CHARS);
    approx = texts.length > 1;
  }
  const pages: PageText[] = texts.map((text, i) => ({ page: i + 1, text: normalizeText(text) }));
  return { pages, pageCount: pages.length, pagesApprox: approx, usedOcr: false };
}
