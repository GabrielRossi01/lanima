/**
 * Where the browser finds the readers' runtime files, copied by scripts/copy-vendor.mjs from
 * node_modules. The versions must be the installed ones: tests/unit/extract.test.ts checks them.
 */
export const VENDOR_VERSIONS = {
  pdfjs: "6.5.438",
  tesseract: "7.0.0",
  tesseractCore: "7.0.0",
  tessdataPor: "1.0.0",
  fraunces: "5.3.0",
  dmSans: "5.3.0",
} as const;

/**
 * Fonts embedded in the exported PDFs (Fraunces + DM Sans, OFL), from @fontsource: `from` (WOFF)
 * in node_modules, `path` where the app serves them, converted to TrueType by copy-vendor.
 * Downloaded on the first export, then offline.
 */
export const PDF_FONT_FILES = {
  serif: {
    from: "@fontsource/fraunces/files/fraunces-latin-600-normal.woff",
    path: `/vendor/fraunces-${VENDOR_VERSIONS.fraunces}/fraunces-latin-600-normal.ttf`,
  },
  sans: {
    from: "@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff",
    path: `/vendor/dm-sans-${VENDOR_VERSIONS.dmSans}/dm-sans-latin-400-normal.ttf`,
  },
  sansBold: {
    from: "@fontsource/dm-sans/files/dm-sans-latin-600-normal.woff",
    path: `/vendor/dm-sans-${VENDOR_VERSIONS.dmSans}/dm-sans-latin-600-normal.ttf`,
  },
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
