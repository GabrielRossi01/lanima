// Generates the PWA icons from the Lanima DNA mark. Run: npm run icons
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const OUT = "public/icons";
const TILE = "#DCE4EA"; // --active (brand 100)
const MARK = "#3E5566"; // --accent (brand 700)
const PATH = "M5 3c0 6 14 12 14 18M19 3c0 6-14 12-14 18M8 6h8M8 18h8M10 12h4";

/**
 * @param {number} size output px
 * @param {number} markRatio fraction of the canvas the 24-unit mark occupies
 * @param {boolean} rounded rounded tile with transparent corners ("any" purpose)
 */
function svg(size, markRatio, rounded) {
  const mark = size * markRatio;
  const offset = (size - mark) / 2;
  const scale = mark / 24;
  const radius = rounded ? size * 0.22 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${TILE}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="${MARK}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="${PATH}"/>
  </g>
</svg>`;
}

const targets = [
  // "any": rounded tile, mark fills more of it.
  { file: "icon-192.png", size: 192, ratio: 0.6, rounded: true },
  { file: "icon-512.png", size: 512, ratio: 0.6, rounded: true },
  // "maskable": full bleed, mark inside the 80% safe zone.
  { file: "icon-maskable-192.png", size: 192, ratio: 0.5, rounded: false },
  { file: "icon-maskable-512.png", size: 512, ratio: 0.5, rounded: false },
  // iOS applies its own rounded mask: full bleed.
  { file: "apple-touch-icon.png", size: 180, ratio: 0.56, rounded: false },
  { file: "favicon-32.png", size: 32, ratio: 0.72, rounded: true },
];

await mkdir(OUT, { recursive: true });
for (const t of targets) {
  await sharp(Buffer.from(svg(t.size, t.ratio, t.rounded)))
    .png()
    .toFile(`${OUT}/${t.file}`);
  console.log(`✓ ${OUT}/${t.file}`);
}
