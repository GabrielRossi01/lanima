"use client";

import { PDF_FONT_FILES } from "@/lib/extract/vendor";
import type { PdfFontFiles } from "@/lib/study/pdf";

/** The app's fonts for the PDF; null when they can't be had (offline before the first export). */
async function loadFonts(): Promise<PdfFontFiles | null> {
  try {
    const get = async (path: string) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(String(response.status));
      return response.arrayBuffer();
    };
    const [serif, sans, sansBold] = await Promise.all([
      get(PDF_FONT_FILES.serif.path),
      get(PDF_FONT_FILES.sans.path),
      get(PDF_FONT_FILES.sansBold.path),
    ]);
    return { serif, sans, sansBold };
  } catch {
    return null;
  }
}

/**
 * Makes a PDF on the device and downloads it. pdf-lib (and fontkit) load only here, on the first
 * export; the service worker keeps them, and the fonts, for offline.
 */
export async function exportPdf(
  title: string,
  make: (pdf: typeof import("@/lib/study/pdf"), fonts: PdfFontFiles | null) => Promise<Uint8Array>,
): Promise<void> {
  const [pdf, fonts] = await Promise.all([import("@/lib/study/pdf"), loadFonts()]);
  const bytes = await make(pdf, fonts);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = pdf.pdfFileName(title);
  document.body.append(link);
  link.click();
  link.remove();
  // Safari reads the blob after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** "26 de novembro de 2026". */
export function longDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}
