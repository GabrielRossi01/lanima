// WOFF 1.0 to TrueType (sfnt): the tables, inflated where compressed, behind a new table directory.
// PDFs need the raw font, and fontkit subsets TTF correctly (WOFF breaks it). Used by
// scripts/copy-vendor.mjs and by tests/unit/study-pdf.test.ts.
import { inflateSync } from "node:zlib";

/** @param {Uint8Array} woff */
export function woffToTtf(woff) {
  const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  if (view.getUint32(0) !== 0x774f4646) throw new Error("woff-to-ttf: not a WOFF 1.0 file");
  const flavor = view.getUint32(4);
  const count = view.getUint16(12);
  const tables = [];
  for (let i = 0; i < count; i++) {
    const at = 44 + i * 20;
    tables.push({
      tag: view.getUint32(at),
      offset: view.getUint32(at + 4),
      compressed: view.getUint32(at + 8),
      length: view.getUint32(at + 12),
      checksum: view.getUint32(at + 16),
    });
  }
  const padded = (n) => (n + 3) & ~3;
  const size = 12 + 16 * count + tables.reduce((sum, t) => sum + padded(t.length), 0);
  const out = new Uint8Array(size);
  const write = new DataView(out.buffer);
  let selector = 0;
  while (1 << (selector + 1) <= count) selector++;
  write.setUint32(0, flavor);
  write.setUint16(4, count);
  write.setUint16(6, 16 << selector);
  write.setUint16(8, selector);
  write.setUint16(10, count * 16 - (16 << selector));
  let offset = 12 + 16 * count;
  tables.forEach((t, i) => {
    const raw = woff.subarray(t.offset, t.offset + t.compressed);
    const data = t.compressed < t.length ? inflateSync(raw) : raw;
    if (data.length !== t.length) throw new Error("woff-to-ttf: table length mismatch");
    out.set(data, offset);
    const entry = 12 + i * 16;
    write.setUint32(entry, t.tag);
    write.setUint32(entry + 4, t.checksum);
    write.setUint32(entry + 8, offset);
    write.setUint32(entry + 12, t.length);
    offset += padded(t.length);
  });
  return out;
}
