"use client";

import type { PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import type { OcrEngine } from "@/lib/extract/ocr";
import type { PdfLib, ReadProgress } from "@/lib/extract/pdf";
import type { Reading } from "@/lib/extract/text";
import { OCR_PATHS, PDFJS_PATHS } from "@/lib/extract/vendor";
import type { FileKind } from "@/lib/files/files";

/**
 * Reads the text of a file on the device (section 7.5, step 1). The readers are loaded only when a
 * file needs them, from the app itself (public/vendor), and kept offline by the service worker.
 */
export interface ReaderProgress {
  /** "Lendo página 3 de 12…" */
  label: string;
  /** 0 to 1, when known. */
  fraction?: number;
}

/** Longest side of an image sent to OCR: enough for book text, without exhausting a tablet. */
const OCR_MAX_SIDE = 2400;

export class ReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReadError";
  }
}

const absolute = (path: string) => new URL(path, window.location.origin).href;

async function startOcr(onProgress: (p: ReaderProgress) => void): Promise<OcrEngine> {
  onProgress({ label: "Preparando a leitura de imagens…" });
  const { createOcr } = await import("@/lib/extract/ocr");
  return createOcr({
    workerPath: absolute(OCR_PATHS.workerPath),
    corePath: absolute(OCR_PATHS.corePath),
    langPath: absolute(OCR_PATHS.langPath),
  });
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/** Decodes a photo (its EXIF rotation applied) into a canvas no larger than `maxSide`. */
export async function photoCanvas(file: Blob, maxSide: number): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ReadError("Não foi possível abrir esta foto neste aparelho. Envie em JPEG ou PNG.");
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = canvasOf(bitmap.width * scale, bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new ReadError("Não foi possível processar a foto neste aparelho.");
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

async function readPhoto(file: Blob, onProgress: (p: ReaderProgress) => void): Promise<Reading> {
  const canvas = await photoCanvas(file, OCR_MAX_SIDE);
  const ocr = await startOcr(onProgress);
  try {
    onProgress({ label: "Lendo a foto…", fraction: 0 });
    const text = await ocr.read(canvas, (fraction) => onProgress({ label: "Lendo a foto…", fraction }));
    return { pages: [{ page: 1, text }], pageCount: 1, pagesApprox: false, usedOcr: true };
  } finally {
    await ocr.close();
  }
}

async function loadPdfjs(): Promise<PdfLib> {
  // The legacy build: it also runs on iPads that are a few years old.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_PATHS.worker;
  return pdfjs as unknown as PdfLib;
}

async function readPdfFile(file: Blob, onProgress: (p: ReaderProgress) => void): Promise<Reading> {
  const [{ readPdf }, lib] = await Promise.all([import("@/lib/extract/pdf"), loadPdfjs()]);
  let ocr: OcrEngine | null = null;
  let scanned: { page: number; total: number } = { page: 0, total: 0 };
  const progress = (p: ReadProgress) => {
    if (p.step === "reading")
      onProgress({ label: `Lendo página ${p.page} de ${p.total}…`, fraction: p.page / p.total });
    else scanned = { page: p.page, total: p.total };
  };
  const ocrPage = async (page: PDFPageProxy) => {
    ocr ??= await startOcr(onProgress);
    const label =
      scanned.total === 1 ? "Lendo a página escaneada…" : `Lendo página escaneada ${scanned.page} de ${scanned.total}…`;
    onProgress({ label, fraction: (scanned.page - 1) / scanned.total });
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, OCR_MAX_SIDE / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = canvasOf(viewport.width, viewport.height);
    await page.render({ canvas, viewport }).promise;
    const text = await ocr.read(canvas, (f) => onProgress({ label, fraction: (scanned.page - 1 + f) / scanned.total }));
    canvas.width = canvas.height = 0; // Frees the pixels now, not at the next garbage collection.
    return text;
  };
  try {
    return await readPdf(new Uint8Array(await file.arrayBuffer()), {
      lib,
      params: {
        cMapUrl: PDFJS_PATHS.cMapUrl,
        cMapPacked: true,
        standardFontDataUrl: PDFJS_PATHS.standardFontDataUrl,
        wasmUrl: PDFJS_PATHS.wasmUrl,
        iccUrl: PDFJS_PATHS.iccUrl,
      },
      ocrPage,
      onProgress: progress,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") {
      throw new ReadError("O PDF está protegido por senha. Remova a senha e envie de novo.");
    }
    if (error instanceof Error && error.name === "InvalidPDFException") {
      throw new ReadError("O PDF está corrompido ou incompleto.");
    }
    throw error;
  } finally {
    await (ocr as OcrEngine | null)?.close();
  }
}

export async function readFile(file: Blob, kind: FileKind, onProgress: (p: ReaderProgress) => void): Promise<Reading> {
  switch (kind) {
    case "pdf":
      return readPdfFile(file, onProgress);
    case "foto":
      return readPhoto(file, onProgress);
    case "documento": {
      onProgress({ label: "Lendo o documento…" });
      const { readDocx } = await import("@/lib/extract/docx");
      return readDocx(await file.arrayBuffer()).catch(() => {
        throw new ReadError("O arquivo Word está corrompido ou não é um .docx.");
      });
    }
    case "slides": {
      onProgress({ label: "Lendo os slides…" });
      const { readPptx } = await import("@/lib/extract/pptx");
      return readPptx(await file.arrayBuffer()).catch(() => {
        throw new ReadError("O arquivo de slides está corrompido ou não é um .pptx.");
      });
    }
  }
}

/** Photos are stored small (section 1): longest side 1600 px, WebP (or JPEG) near 0.75, ~400 KB. */
export async function compressPhoto(file: File): Promise<{ blob: Blob; extension: "webp" | "jpg" }> {
  const { default: imageCompression } = await import("browser-image-compression");
  const options = { maxWidthOrHeight: 1600, maxSizeMB: 0.4, initialQuality: 0.75, useWebWorker: false };
  try {
    const webp = await imageCompression(file, { ...options, fileType: "image/webp" });
    // Older Safari can't encode WebP and quietly returns PNG: then JPEG.
    if (webp.type === "image/webp") return { blob: webp, extension: "webp" };
    const jpeg = await imageCompression(file, { ...options, fileType: "image/jpeg" });
    if (jpeg.type === "image/jpeg") return { blob: jpeg, extension: "jpg" };
  } catch {
    // Falls through to the message below.
  }
  throw new ReadError("Não foi possível abrir esta foto neste aparelho. Envie em JPEG ou PNG.");
}
