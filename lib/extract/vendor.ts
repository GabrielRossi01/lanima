/**
 * Where the browser finds the readers' runtime files, copied by scripts/copy-vendor.mjs from
 * node_modules. The versions must be the installed ones: tests/unit/extract.test.ts checks them.
 */
export const VENDOR_VERSIONS = {
  pdfjs: "6.5.438",
  tesseract: "7.0.0",
  tesseractCore: "7.0.0",
  tessdataPor: "1.0.0",
} as const;

const pdfjs = `/vendor/pdfjs-${VENDOR_VERSIONS.pdfjs}`;

export const PDFJS_PATHS = {
  worker: `${pdfjs}/pdf.worker.min.mjs`,
  cMapUrl: `${pdfjs}/cmaps/`,
  standardFontDataUrl: `${pdfjs}/standard_fonts/`,
  wasmUrl: `${pdfjs}/wasm/`,
  iccUrl: `${pdfjs}/iccs/`,
} as const;

export const OCR_PATHS = {
  workerPath: `/vendor/tesseract-${VENDOR_VERSIONS.tesseract}/worker.min.js`,
  corePath: `/vendor/tesseract-core-${VENDOR_VERSIONS.tesseractCore}`,
  langPath: `/vendor/tessdata-por-${VENDOR_VERSIONS.tessdataPor}`,
} as const;
