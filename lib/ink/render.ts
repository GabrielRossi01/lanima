import { getStroke } from "perfect-freehand";
import type { PageBackground, PageElement } from "@/lib/notebook/model";
import { PAGE_HEIGHT, PAGE_WIDTH, type InkColor, type InkPoint, type InkTool, type Stroke } from "./strokes";

/**
 * Drawing the notebook on a canvas (section 7.2): the outline of each stroke comes from
 * perfect-freehand (pressure → width); highlighters go first, behind the ink.
 */

export type InkTheme = "light" | "dark";

const INK: Record<InkTheme, Record<InkColor, string>> = {
  light: { grafite: "#2E404D", azul: "#5D7A8C", amarelo: "#F7E38A", rosa: "#F6BACB", verde: "#BFE5CB" },
  // Grafite turns white; azul cimento a lighter shade, to be read on the dark page.
  dark: { grafite: "#ECEEED", azul: "#9FB5C4", amarelo: "#F7E38A", rosa: "#F6BACB", verde: "#BFE5CB" },
};

/** Highlighters in the dark use the closed colors of section 4.1. */
const HIGHLIGHT_DARK: Record<InkColor, string> = {
  grafite: "#54486E",
  azul: "#34586E",
  amarelo: "#6E6230",
  rosa: "#6E3F50",
  verde: "#3D6651",
};

export const PAPER: Record<InkTheme, { page: string; dot: string; rule: string }> = {
  light: { page: "#FFFFFF", dot: "#C3CBD0", rule: "#DBE2E7" },
  dark: { page: "#1D262D", dot: "#3D4952", rule: "#33404A" },
};

export function inkColor(color: InkColor, tool: InkTool, theme: InkTheme): string {
  if (tool === "marca_texto" && theme === "dark") return HIGHLIGHT_DARK[color];
  return INK[theme][color];
}

/** Opacity of each tool: the pen is solid, the pencil a little lighter, the highlighter see-through. */
export function inkAlpha(tool: InkTool, theme: InkTheme): number {
  if (tool === "lapis") return 0.85;
  if (tool === "marca_texto") return theme === "light" ? 0.4 : 1;
  return 1;
}

/** Without real pressure (finger, mouse: always 0.5), perfect-freehand simulates it from speed. */
const hasPressure = (points: readonly InkPoint[]) => points.some((p) => p[2] !== 0.5);

export function strokeOutline(stroke: Pick<Stroke, "tool" | "size" | "points">, last = true): number[][] {
  const highlighter = stroke.tool === "marca_texto";
  return getStroke(stroke.points as InkPoint[], {
    size: stroke.size,
    thinning: highlighter ? 0 : stroke.tool === "lapis" ? 0.45 : 0.6,
    smoothing: 0.5,
    streamline: highlighter ? 0.6 : 0.4,
    simulatePressure: !highlighter && !hasPressure(stroke.points),
    start: { cap: !highlighter, taper: 0 },
    end: { cap: !highlighter, taper: 0 },
    last,
  });
}

/** perfect-freehand's outline as an SVG path (quadratic curves between midpoints). */
export function outlinePath(outline: readonly number[][]): string {
  if (outline.length < 2) return "";
  const r = (n: number) => Math.round(n * 100) / 100;
  let d = `M${r(outline[0][0])} ${r(outline[0][1])} Q`;
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    d += ` ${r(x0)} ${r(y0)} ${r((x0 + x1) / 2)} ${r((y0 + y1) / 2)}`;
  }
  return `${d} Z`;
}

/** Finished strokes don't change: their Path2D is made once. */
const paths = new WeakMap<object, Path2D>();
export function strokePath(stroke: Stroke): Path2D {
  let path = paths.get(stroke);
  if (!path) {
    path = new Path2D(outlinePath(strokeOutline(stroke)));
    paths.set(stroke, path);
  }
  return path;
}

/** Page background in page units; `ctx` already scaled to page space. */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  background: PageBackground,
  theme: InkTheme,
  pixelsPerUnit: number,
) {
  const paper = PAPER[theme];
  ctx.fillStyle = paper.page;
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  if (background === "pontilhado") {
    ctx.fillStyle = paper.dot;
    // At least ~0.8 px on screen, so small thumbnails still show the dots.
    const radius = Math.max(1.6, 0.8 / pixelsPerUnit);
    const step = pixelsPerUnit < 0.25 ? 50 : 25;
    ctx.beginPath();
    for (let y = step; y < PAGE_HEIGHT; y += step) {
      for (let x = step; x < PAGE_WIDTH; x += step) {
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  } else if (background === "pautado") {
    ctx.strokeStyle = paper.rule;
    ctx.lineWidth = Math.max(1.2, 1 / pixelsPerUnit);
    ctx.beginPath();
    for (let y = 110; y < PAGE_HEIGHT - 20; y += 32) {
      ctx.moveTo(40, y);
      ctx.lineTo(PAGE_WIDTH - 40, y);
    }
    ctx.stroke();
  }
}

/** Highlighters first (behind the ink), then pen and pencil, each in the order drawn. */
export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: readonly Stroke[], theme: InkTheme) {
  for (const pass of [true, false]) {
    for (const stroke of strokes) {
      if ((stroke.tool === "marca_texto") !== pass) continue;
      drawStroke(ctx, stroke, theme);
    }
  }
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, theme: InkTheme, path = strokePath(stroke)) {
  ctx.save();
  ctx.globalAlpha = inkAlpha(stroke.tool, theme);
  if (stroke.tool === "marca_texto" && theme === "light") ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = inkColor(stroke.color, stroke.tool, theme);
  ctx.fill(path);
  ctx.restore();
}

/** Text boxes as plain text and pictures as a frame: enough for thumbnails and exports' previews. */
export function drawElementsPreview(
  ctx: CanvasRenderingContext2D,
  elements: readonly PageElement[],
  theme: InkTheme,
  images?: ReadonlyMap<string, CanvasImageSource>,
) {
  for (const element of elements) {
    if (element.type === "texto") {
      ctx.save();
      ctx.fillStyle = INK[theme].grafite;
      ctx.font = `${element.size}px "DM Sans", system-ui, sans-serif`;
      ctx.textBaseline = "top";
      const lineHeight = element.size * 1.35;
      let y = element.y;
      for (const line of wrapText(ctx, element.text, element.w)) {
        ctx.fillText(line, element.x, y);
        y += lineHeight;
      }
      ctx.restore();
    } else {
      const image = images?.get(element.imageId);
      if (image) {
        ctx.drawImage(image, element.x, element.y, element.w, element.h);
      } else {
        ctx.save();
        ctx.fillStyle = theme === "light" ? "#EEF2F5" : "#222D35";
        ctx.fillRect(element.x, element.y, element.w, element.h);
        ctx.restore();
      }
    }
  }
}

/** Breaks text in lines that fit `width`, keeping her line breaks. */
export function wrapText(ctx: Pick<CanvasRenderingContext2D, "measureText">, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/(\s+)/)) {
      const next = line + word;
      if (line && ctx.measureText(next).width > width) {
        lines.push(line.trimEnd());
        line = word.trimStart();
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** A whole page, scaled so the page is `width` CSS px wide (thumbnails). */
export function drawPage(
  ctx: CanvasRenderingContext2D,
  page: { background: PageBackground; strokes: readonly Stroke[]; elements: readonly PageElement[] },
  theme: InkTheme,
  width: number,
  pixelRatio: number,
) {
  const scale = (width / PAGE_WIDTH) * pixelRatio;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawBackground(ctx, page.background, theme, width / PAGE_WIDTH);
  drawElementsPreview(ctx, page.elements, theme);
  drawStrokes(ctx, page.strokes, theme);
}
