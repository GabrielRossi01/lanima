import type {
  DocumentInitParameters,
  PDFPageProxy,
  TextItem,
  TextMarkedContent,
} from "pdfjs-dist/types/src/display/api";
import { MIN_PAGE_CHARS, normalizeText, readableChars, type PageText, type Reading } from "./text";

/** The parts of pdf.js used here: the browser passes its build, the tests the Node one. */
export interface PdfLib {
  getDocument: (params: DocumentInitParameters) => {
    promise: Promise<{ numPages: number; getPage: (n: number) => Promise<PDFPageProxy> }>;
    destroy: () => Promise<void>;
  };
}

export type ReadProgress =
  { step: "reading"; page: number; total: number } | { step: "ocr"; page: number; total: number };

export interface PdfOptions {
  lib: PdfLib;
  /** URLs of pdf.js' data (cmaps, fonts, wasm), in the browser. */
  params?: Omit<DocumentInitParameters, "data">;
  /** Reads a page that is a picture of text. Without it, such pages are left empty. */
  ocrPage?: (page: PDFPageProxy) => Promise<string>;
  onProgress?: (progress: ReadProgress) => void;
}

/** Joins the text pieces of a page, putting back the spaces and line breaks the PDF only implies. */
export function joinTextItems(items: ReadonlyArray<TextItem | TextMarkedContent>): string {
  let out = "";
  let last: { x: number; y: number; end: number; height: number } | null = null;
  for (const item of items) {
    if (!("str" in item)) continue;
    const [, , , , x, y] = item.transform as number[];
    const height = Math.abs(item.height) || Math.abs((item.transform as number[])[3]) || 10;
    if (last && item.str) {
      const newLine = Math.abs(y - last.y) > Math.max(last.height, height) * 0.5;
      if (newLine) {
        if (!out.endsWith("\n")) out += "\n";
      } else if (x - last.end > height * 0.2 && !/\s$/.test(out) && !/^\s/.test(item.str)) {
        out += " ";
      }
    }
    out += item.str;
    if (item.hasEOL) out += "\n";
    if (item.str || item.hasEOL) last = { x, y, end: x + item.width, height };
  }
  return out;
}

/** Text of every page, with its number. Pages without text go to `ocrPage`, when given. */
export async function readPdf(data: Uint8Array, { lib, params, ocrPage, onProgress }: PdfOptions): Promise<Reading> {
  const task = lib.getDocument({ ...params, data });
  try {
    const pdf = await task.promise;
    const total = pdf.numPages;
    const pages: PageText[] = [];
    const pictures: number[] = [];
    for (let n = 1; n <= total; n++) {
      onProgress?.({ step: "reading", page: n, total });
      const page = await pdf.getPage(n);
      const text = normalizeText(joinTextItems((await page.getTextContent()).items));
      page.cleanup();
      if (readableChars(text) < MIN_PAGE_CHARS) pictures.push(n);
      pages.push({ page: n, text });
    }
    let usedOcr = false;
    if (ocrPage) {
      for (const [i, n] of pictures.entries()) {
        onProgress?.({ step: "ocr", page: i + 1, total: pictures.length });
        const page = await pdf.getPage(n);
        const read = normalizeText(await ocrPage(page));
        page.cleanup();
        const before = pages[n - 1].text;
        // OCR only replaces what pdf.js found if it found more.
        if (readableChars(read) > readableChars(before)) {
          pages[n - 1] = { page: n, text: read };
          usedOcr = true;
        }
      }
    }
    return { pages, pageCount: total, pagesApprox: false, usedOcr };
  } finally {
    await task.destroy();
  }
}
