import JSZip from "jszip";
import { normalizeText, type PageText, type Reading } from "./text";

/** PowerPoint (.pptx): the text of each slide, in the presentation's order, and its speaker notes. */
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";

/** Placeholders that repeat on every slide or hold no content. */
const SKIPPED_ON_SLIDES = new Set(["sldNum", "dt", "ftr", "hdr"]);
const SKIPPED_IN_NOTES = new Set(["sldNum", "dt", "ftr", "hdr", "sldImg"]);

export const NOTES_TITLE = "Notas do apresentador:";

function parse(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) throw new Error("pptx: XML inválido");
  return doc;
}

async function xmlOf(zip: JSZip, path: string): Promise<Document | null> {
  const text = await zip.file(path)?.async("string");
  return text ? parse(text) : null;
}

/** Resolves a relationship target against the folder of the part that points to it. */
function resolve(from: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = from.split("/").slice(0, -1);
  for (const piece of target.split("/")) {
    if (piece === "..") parts.pop();
    else if (piece !== ".") parts.push(piece);
  }
  return parts.join("/");
}

/** Relationships of a part: id → { target path, type }. */
async function relationsOf(zip: JSZip, part: string): Promise<Map<string, { path: string; type: string }>> {
  const folder = part.split("/").slice(0, -1).join("/");
  const name = part.split("/").pop();
  const doc = await xmlOf(zip, `${folder}/_rels/${name}.rels`);
  const map = new Map<string, { path: string; type: string }>();
  for (const rel of Array.from(doc?.getElementsByTagNameNS(REL, "Relationship") ?? [])) {
    if (rel.getAttribute("TargetMode") === "External") continue;
    map.set(rel.getAttribute("Id") ?? "", {
      path: resolve(part, rel.getAttribute("Target") ?? ""),
      type: rel.getAttribute("Type") ?? "",
    });
  }
  return map;
}

/** Text of the shapes of a slide or notes page, paragraph by paragraph, in document order. */
function shapeText(doc: Document, skipped: ReadonlySet<string>, onlyBody = false): string {
  const lines: string[] = [];
  const walk = (node: Element) => {
    if (node.namespaceURI === MC && node.localName === "Fallback") return;
    if (node.namespaceURI === P && node.localName === "sp") {
      const placeholder = node.getElementsByTagNameNS(P, "ph")[0];
      const type = placeholder?.getAttribute("type") ?? (placeholder ? "body" : null);
      if (type && skipped.has(type)) return;
      if (onlyBody && type !== "body") return;
    }
    if (node.namespaceURI === A && node.localName === "p") {
      let line = "";
      const runs = (el: Element) => {
        for (const child of Array.from(el.children)) {
          if (child.namespaceURI === A && child.localName === "t") line += child.textContent ?? "";
          else if (child.namespaceURI === A && child.localName === "br") line += "\n";
          else runs(child);
        }
      };
      runs(node);
      lines.push(line);
      return;
    }
    for (const child of Array.from(node.children)) walk(child);
  };
  walk(doc.documentElement);
  return lines.join("\n");
}

export async function readPptx(data: ArrayBuffer | Uint8Array): Promise<Reading> {
  const zip = await JSZip.loadAsync(data);
  const presentation = await xmlOf(zip, "ppt/presentation.xml");
  if (!presentation) throw new Error("pptx: sem ppt/presentation.xml");
  const relations = await relationsOf(zip, "ppt/presentation.xml");
  const ids = Array.from(presentation.getElementsByTagNameNS(P, "sldId"));

  const pages: PageText[] = [];
  for (const [i, slide] of ids.entries()) {
    const target = relations.get(slide.getAttributeNS(R, "id") ?? "");
    const doc = target && (await xmlOf(zip, target.path));
    let text = doc ? shapeText(doc, SKIPPED_ON_SLIDES) : "";
    if (target) {
      const notesPath = [...(await relationsOf(zip, target.path)).values()].find((r) =>
        r.type.endsWith("/notesSlide"),
      )?.path;
      const notesDoc = notesPath ? await xmlOf(zip, notesPath) : null;
      const notes = notesDoc ? normalizeText(shapeText(notesDoc, SKIPPED_IN_NOTES, true)) : "";
      if (notes) text += `\n\n${NOTES_TITLE}\n${notes}`;
    }
    pages.push({ page: i + 1, text: normalizeText(text) });
  }
  return { pages, pageCount: pages.length, pagesApprox: false, usedOcr: false };
}
