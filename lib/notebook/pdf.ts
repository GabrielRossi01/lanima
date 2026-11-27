import fontkit from "@pdf-lib/fontkit";
import { BlendMode, PDFDocument, rgb, StandardFonts, type PDFEmbeddedPage, type PDFFont, type RGB } from "pdf-lib";
import { inkAlpha, inkColor, outlinePath, PAPER, strokeOutline, wrapText } from "@/lib/ink/render";
import { PAGE_WIDTH, type Stroke } from "@/lib/ink/strokes";
import type { PageBackground, PageElement } from "./model";

/**
 * "Exportar a página ou o caderno em PDF (vetorial quando possível)" (section 7.2), made on the
 * device with pdf-lib. Strokes are vector outlines (the same shapes perfect-freehand gives the
 * screen), text boxes are real text, pictures are embedded. Always the light page: it is printed.
 */

export interface NotebookPdfPage {
  background: PageBackground;
  strokes: readonly Stroke[];
  elements: readonly PageElement[];
}

/** A picture ready for the PDF (pdf-lib embeds PNG and JPEG only). */
export interface NotebookPdfImage {
  bytes: Uint8Array;
  kind: "png" | "jpg";
}

/** A4 in points: the page is 1000 units wide. */
const A4 = { width: 595.28, height: 841.89 };
const SCALE = A4.width / PAGE_WIDTH;

const hex = (h: string): RGB =>
  rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

/** The paper of each background, drawn once and placed under every page that has it. */
async function backgrounds(doc: PDFDocument): Promise<Partial<Record<PageBackground, PDFEmbeddedPage>>> {
  const paper = PAPER.light;
  const template = await PDFDocument.create();
  const dots = template.addPage([A4.width, A4.height]);
  for (let y = 25; y < 1414; y += 25) {
    for (let x = 25; x < PAGE_WIDTH; x += 25) {
      dots.drawCircle({ x: x * SCALE, y: A4.height - y * SCALE, size: 0.75, color: hex(paper.dot) });
    }
  }
  const ruled = template.addPage([A4.width, A4.height]);
  for (let y = 110; y < 1414 - 20; y += 32) {
    ruled.drawLine({
      start: { x: 40 * SCALE, y: A4.height - y * SCALE },
      end: { x: (PAGE_WIDTH - 40) * SCALE, y: A4.height - y * SCALE },
      thickness: 0.6,
      color: hex(paper.rule),
    });
  }
  const [pontilhado, pautado] = await doc.embedPages([dots, ruled]);
  return { pontilhado, pautado };
}

/** Text the font can draw: other characters dropped (a standard font has few). */
function drawable(font: PDFFont, cache: Map<PDFFont, Set<number>>) {
  let set = cache.get(font);
  if (!set) {
    set = new Set(font.getCharacterSet());
    cache.set(font, set);
  }
  const chars = set;
  return (text: string) => [...text.normalize("NFC")].filter((c) => chars.has(c.codePointAt(0)!)).join("");
}

export async function notebookPdf(
  input: { title: string; pages: readonly NotebookPdfPage[]; images: ReadonlyMap<string, NotebookPdfImage> },
  sansFont: ArrayBuffer | Uint8Array | null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(input.title);
  doc.setCreator("Lanima");
  doc.setProducer("Lanima");
  doc.setLanguage("pt-BR");
  let font: PDFFont;
  if (sansFont) {
    doc.registerFontkit(fontkit);
    font = await doc.embedFont(sansFont, { subset: true, features: { liga: false } });
  } else {
    font = await doc.embedFont(StandardFonts.Helvetica);
  }
  const clean = drawable(font, new Map());
  const paper = await backgrounds(doc);
  const embedded = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>();
  for (const [id, image] of input.images) {
    try {
      embedded.set(id, image.kind === "png" ? await doc.embedPng(image.bytes) : await doc.embedJpg(image.bytes));
    } catch {
      // A picture that can't be read is left out; the rest of the page still goes.
    }
  }
  const ink = hex(inkColor("grafite", "caneta", "light"));

  for (const content of input.pages) {
    const page = doc.addPage([A4.width, A4.height]);
    const background = paper[content.background as keyof typeof paper];
    if (background) page.drawPage(background, { x: 0, y: 0, width: A4.width, height: A4.height });

    for (const element of content.elements) {
      if (element.type === "imagem") {
        const image = embedded.get(element.imageId);
        if (!image) continue;
        page.drawImage(image, {
          x: element.x * SCALE,
          y: A4.height - (element.y + element.h) * SCALE,
          width: element.w * SCALE,
          height: element.h * SCALE,
        });
      } else {
        const size = element.size * SCALE;
        const measure = { measureText: (t: string) => ({ width: font.widthOfTextAtSize(clean(t), size) }) };
        wrapText(measure, element.text, element.w * SCALE).forEach((line, i) => {
          page.drawText(clean(line), {
            x: element.x * SCALE,
            // The first baseline about one size below the top of the box, then 1.35 per line.
            y: A4.height - (element.y + element.size * (0.95 + i * 1.35)) * SCALE,
            size,
            font,
            color: ink,
          });
        });
      }
    }

    // Highlighters first, behind the ink (multiplied, as on the light page).
    for (const pass of [true, false]) {
      for (const stroke of content.strokes) {
        if ((stroke.tool === "marca_texto") !== pass) continue;
        const d = outlinePath(strokeOutline(stroke));
        if (!d) continue;
        page.drawSvgPath(d, {
          x: 0,
          y: A4.height,
          scale: SCALE,
          color: hex(inkColor(stroke.color, stroke.tool, "light")),
          opacity: inkAlpha(stroke.tool),
          borderWidth: 0,
          blendMode: stroke.tool === "marca_texto" ? BlendMode.Multiply : undefined,
        });
      }
    }
  }
  return doc.save();
}
