"use client";

import { downloadFile, loadSansFont } from "@/features/study/export-pdf";
import type { NotebookPdfImage } from "@/lib/notebook/pdf";
import { getPage, loadImage, type LocalPage } from "@/lib/notebook/sync";
import { pdfFileName } from "@/lib/study/file-name";

/**
 * The notebook as a PDF (section 7.2): a page or the whole notebook, made on the device (it works
 * offline once the fonts were downloaded), downloaded or shared.
 */

/** pdf-lib embeds PNG and JPEG: a WebP picture (how the notebook keeps them) is turned into JPEG. */
async function forPdf(blob: Blob): Promise<NotebookPdfImage | null> {
  const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
  if (blob.type === "image/png") return { bytes: await bytes(blob), kind: "png" };
  if (blob.type === "image/jpeg") return { bytes: await bytes(blob), kind: "jpg" };
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    return jpeg ? { bytes: await bytes(jpeg), kind: "jpg" } : null;
  } catch {
    return null;
  }
}

export interface NotebookPdf {
  bytes: Uint8Array;
  fileName: string;
}

/** The PDF of these pages of a notebook, in this order. */
export async function makeNotebookPdf(
  userId: string,
  input: { title: string; pageIds: readonly string[]; pageNumber?: number },
): Promise<NotebookPdf> {
  const pages = (await Promise.all(input.pageIds.map((id) => getPage(userId, id)))).filter(
    (p): p is LocalPage => p !== null,
  );
  const images = new Map<string, NotebookPdfImage>();
  for (const page of pages) {
    for (const element of page.elements) {
      if (element.type !== "imagem" || images.has(element.imageId)) continue;
      const blob = await loadImage(userId, page.id, element.imageId);
      const image = blob && (await forPdf(blob));
      if (image) images.set(element.imageId, image);
    }
  }
  const [{ notebookPdf }, sans] = await Promise.all([import("@/lib/notebook/pdf"), loadSansFont()]);
  const title = input.pageNumber ? `${input.title} · página ${input.pageNumber}` : input.title;
  const bytes = await notebookPdf({ title, pages, images }, sans);
  return { bytes, fileName: pdfFileName(title) };
}

export function downloadNotebookPdf(pdf: NotebookPdf) {
  downloadFile(pdf.bytes, pdf.fileName);
}

/**
 * Shares the PDF with the system's sheet (Web Share API, with files); where that doesn't exist (or
 * can't take files), it is downloaded instead. Resolves to how it went.
 */
export async function shareNotebookPdf(
  pdf: NotebookPdf,
  title: string,
): Promise<"compartilhado" | "baixado" | "cancelado"> {
  const file = new File([pdf.bytes as BlobPart], pdf.fileName, { type: "application/pdf" });
  if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "compartilhado";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelado";
    }
  }
  downloadFile(pdf.bytes, pdf.fileName);
  return "baixado";
}
