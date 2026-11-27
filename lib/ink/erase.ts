import type { PageElement, TextElement } from "@/lib/notebook/model";
import { simplifyPoints, type InkPoint, type Stroke } from "./strokes";

/**
 * The eraser and the lasso (section 7.2), in page units. Pure: the editor calls them as the pen
 * moves and draws the result.
 */

export type Box = { x0: number; y0: number; x1: number; y1: number };

function distanceToSegment(px: number, py: number, a: InkPoint, b: InkPoint): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(Math.max(((px - a[0]) * dx + (py - a[1]) * dy) / len2, 0), 1);
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

/** Whether the eraser (a circle at x, y) touches the stroke's line. */
export function touchesStroke(stroke: Stroke, x: number, y: number, radius: number): boolean {
  const reach = radius + stroke.size / 2;
  const points = stroke.points;
  if (points.length === 1) return Math.hypot(points[0][0] - x, points[0][1] - y) <= reach;
  for (let i = 1; i < points.length; i++) {
    if (distanceToSegment(x, y, points[i - 1], points[i]) <= reach) return true;
  }
  return false;
}

/** Points no farther apart than `step`, so the eraser can cut a long straight piece in the middle. */
function densify(points: readonly InkPoint[], step: number): InkPoint[] {
  const out: InkPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay, ap] = points[i - 1];
    const [bx, by, bp] = points[i];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / step);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push([ax + (bx - ax) * t, ay + (by - ay) * t, ap + (bp - ap) * t]);
    }
  }
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The eraser by area: what is left of the stroke outside the circle, as one or more strokes (new
 * ids), or null when the circle doesn't touch it.
 */
export function eraseArea(stroke: Stroke, x: number, y: number, radius: number, newId: () => string): Stroke[] | null {
  if (!touchesStroke(stroke, x, y, radius)) return null;
  const reach = radius + stroke.size / 2;
  const pieces: InkPoint[][] = [];
  let piece: InkPoint[] = [];
  for (const p of densify(stroke.points, Math.max(radius / 3, 1))) {
    if (Math.hypot(p[0] - x, p[1] - y) <= reach) {
      if (piece.length > 0) pieces.push(piece);
      piece = [];
    } else {
      piece.push(p);
    }
  }
  if (piece.length > 0) pieces.push(piece);
  return pieces
    .filter((points) => points.length >= 2)
    .map((points) => ({
      ...stroke,
      id: newId(),
      points: simplifyPoints(points.map(([px, py, pp]) => [round1(px), round1(py), Math.round(pp * 100) / 100])),
    }));
}

/** Ray casting: whether a point is inside the lasso. */
export function insidePolygon(x: number, y: number, polygon: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A stroke is taken by the lasso when most of its points are inside. */
export function strokeInLasso(stroke: Stroke, polygon: readonly (readonly [number, number])[]): boolean {
  const step = Math.max(1, Math.floor(stroke.points.length / 20));
  let inside = 0;
  let total = 0;
  for (let i = 0; i < stroke.points.length; i += step) {
    total++;
    if (insidePolygon(stroke.points[i][0], stroke.points[i][1], polygon)) inside++;
  }
  return inside * 2 >= total;
}

/** A text box's height, estimated from its text (it wraps at its width). */
export function textBoxHeight(element: TextElement): number {
  const perLine = Math.max(1, Math.floor(element.w / (element.size * 0.52)));
  const lines = element.text
    .split("\n")
    .reduce((sum, paragraph) => sum + Math.max(1, Math.ceil(paragraph.length / perLine)), 0);
  return lines * element.size * 1.35;
}

export function elementBox(element: PageElement): Box {
  const h = element.type === "imagem" ? element.h : textBoxHeight(element);
  return { x0: element.x, y0: element.y, x1: element.x + element.w, y1: element.y + h };
}

/** An element is taken by the lasso when its middle is inside. */
export function elementInLasso(element: PageElement, polygon: readonly (readonly [number, number])[]): boolean {
  const b = elementBox(element);
  return insidePolygon((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, polygon);
}

export function unionBox(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  return boxes.reduce((a, b) => ({
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  }));
}

/** A stroke moved by (dx, dy), as it is saved (1 decimal). */
export function moveStroke(stroke: Stroke, dx: number, dy: number): Stroke {
  return { ...stroke, points: stroke.points.map(([x, y, p]) => [round1(x + dx), round1(y + dy), p] as InkPoint) };
}
