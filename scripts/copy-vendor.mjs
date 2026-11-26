// Copies the files that text extraction loads at runtime (pdf.js worker and data, the OCR engine
// and the Portuguese language data) from node_modules to public/vendor, under versioned folders.
// The app serves them itself: no third-party CDN. Runs before `dev` and `build`; public/vendor is
// not committed. The versions must match lib/extract/vendor.ts (checked by a unit test).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modules = join(root, "node_modules");
const out = join(root, "public", "vendor");
const version = (pkg) => JSON.parse(readFileSync(join(modules, pkg, "package.json"), "utf8")).version;

const pdfjs = `pdfjs-${version("pdfjs-dist")}`;
const tesseract = `tesseract-${version("tesseract.js")}`;
const core = `tesseract-core-${version("tesseract.js-core")}`;
const lang = `tessdata-por-${version("@tesseract.js-data/por")}`;

/** [from (in node_modules), to (in public/vendor)] */
const copies = [
  // The legacy build runs on older Safari (iPad) too.
  ["pdfjs-dist/legacy/build/pdf.worker.min.mjs", `${pdfjs}/pdf.worker.min.mjs`],
  ["pdfjs-dist/cmaps", `${pdfjs}/cmaps`],
  ["pdfjs-dist/standard_fonts", `${pdfjs}/standard_fonts`],
  ["pdfjs-dist/wasm", `${pdfjs}/wasm`],
  ["pdfjs-dist/iccs", `${pdfjs}/iccs`],
  ["tesseract.js/dist/worker.min.js", `${tesseract}/worker.min.js`],
  // "best_int": the accurate LSTM model, integer-quantized (1.4 MB instead of 6.7 MB).
  ["@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz", `${lang}/por.traineddata.gz`],
];
// Only the LSTM builds of the engine (the app uses LSTM only); the device loads the one it supports.
for (const name of readdirSync(join(modules, "tesseract.js-core"))) {
  if (/^tesseract-core(-[a-z]+)?-lstm\.wasm\.js$/.test(name))
    copies.push([`tesseract.js-core/${name}`, `${core}/${name}`]);
}

for (const [from, to] of copies) {
  const source = join(modules, from);
  const target = join(out, to);
  if (!existsSync(source)) throw new Error(`copy-vendor: missing ${from}`);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}
console.log(`copy-vendor: ${copies.length} items in public/vendor (${pdfjs}, ${tesseract}, ${core}, ${lang})`);
