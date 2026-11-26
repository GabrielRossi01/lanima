import type { ImageLike, LoggerMessage } from "tesseract.js";
import { normalizeText, readableChars } from "./text";

/**
 * OCR with tesseract.js (Portuguese, LSTM), which runs in its own Web Worker. One engine reads all
 * the pages of a file and is let go at the end: it holds tens of MB.
 */
export interface OcrPaths {
  workerPath?: string;
  corePath?: string;
  /** Folder with por.traineddata.gz. */
  langPath: string;
  /** Node only: where tesseract.js keeps the unzipped data. */
  cachePath?: string;
}

export interface OcrEngine {
  read: (image: ImageLike, onProgress?: (fraction: number) => void) => Promise<string>;
  close: () => Promise<void>;
}

/** Below this mean confidence (0–100), what came out is noise: a photo without text. */
export const MIN_CONFIDENCE = 45;

export async function createOcr(paths: OcrPaths): Promise<OcrEngine> {
  const { createWorker, OEM } = await import("tesseract.js");
  let report: ((fraction: number) => void) | undefined;
  const worker = await createWorker("por", OEM.LSTM_ONLY, {
    ...paths,
    gzip: true,
    // The service worker keeps the files (app/sw.ts); in Node, the cache folder does.
    cacheMethod: paths.cachePath ? "write" : "none",
    logger: (m: LoggerMessage) => {
      if (m.status === "recognizing text") report?.(m.progress);
    },
  });
  return {
    async read(image, onProgress) {
      report = onProgress;
      try {
        const { data } = await worker.recognize(image);
        const text = normalizeText(data.text);
        return data.confidence < MIN_CONFIDENCE || readableChars(text) < 3 ? "" : text;
      } finally {
        report = undefined;
      }
    },
    close: async () => {
      await worker.terminate();
    },
  };
}
