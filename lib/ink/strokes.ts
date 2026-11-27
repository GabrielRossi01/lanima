import { z } from "zod";

/**
 * Strokes of the notebook (section 7.2): `{ id, tool, color, size, points: [[x, y, pressure], …] }`
 * in page space, an A4 sheet 1000 wide. Coordinates are kept with 1 decimal and the pressure with
 * 2; the points are lightly simplified (Ramer–Douglas–Peucker) before saving.
 */

export const PAGE_WIDTH = 1000;
/** A4 is 1 : √2. */
export const PAGE_HEIGHT = 1414;

export const INK_TOOLS = ["caneta", "lapis", "marca_texto"] as const;
export type InkTool = (typeof INK_TOOLS)[number];

/** Names, not hex: each theme draws them its own way (grafite turns white in the dark). */
export const INK_COLORS = ["grafite", "azul", "amarelo", "rosa", "verde"] as const;
export type InkColor = (typeof INK_COLORS)[number];

/** The three thicknesses of each tool, in page units. The highlighter has a fixed width per level. */
export const STROKE_SIZES: Record<InkTool, readonly [number, number, number]> = {
  caneta: [2.2, 3.6, 6],
  lapis: [1.8, 3, 5],
  marca_texto: [14, 22, 32],
};

export type InkPoint = [x: number, y: number, pressure: number];

const coordinate = z
  .number()
  .finite()
  .min(-PAGE_WIDTH)
  .max(PAGE_HEIGHT * 2);

export const strokeSchema = z.object({
  id: z.string().min(1).max(40),
  tool: z.enum(INK_TOOLS),
  color: z.enum(INK_COLORS),
  size: z.number().positive().max(60),
  points: z
    .array(z.tuple([coordinate, coordinate, z.number().min(0).max(1)]))
    .min(1)
    .max(5000),
});
export type Stroke = z.infer<typeof strokeSchema>;

const round = (value: number, places: number) => {
  const f = 10 ** places;
  const r = Math.round(value * f) / f;
  // -0 would be written "0" by JSON anyway; keep it plain.
  return r === 0 ? 0 : r;
};

/** A point as it is saved: inside the page, x and y with 1 decimal, pressure with 2. */
export function quantizePoint([x, y, p]: InkPoint): InkPoint {
  return [
    round(Math.min(Math.max(x, 0), PAGE_WIDTH), 1),
    round(Math.min(Math.max(y, 0), PAGE_HEIGHT), 1),
    round(Math.min(Math.max(Number.isFinite(p) ? p : 0.5, 0), 1), 2),
  ];
}

/**
 * Pressure weighs in the distance like this many page units per 1.0, so a stroke that only gets
 * thicker keeps the points where it does.
 */
const PRESSURE_WEIGHT = 8;

function distanceToSegment(p: InkPoint, a: InkPoint, b: InkPoint): number {
  const d = [b[0] - a[0], b[1] - a[1], (b[2] - a[2]) * PRESSURE_WEIGHT];
  const v = [p[0] - a[0], p[1] - a[1], (p[2] - a[2]) * PRESSURE_WEIGHT];
  const len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const t = len2 === 0 ? 0 : Math.min(Math.max((v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / len2, 0), 1);
  const e = [v[0] - t * d[0], v[1] - t * d[1], v[2] - t * d[2]];
  return Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
}

/**
 * Ramer–Douglas–Peucker, iterative (a long stroke must not overflow the stack). `tolerance` in page
 * units: 0.35 is a third of a pixel on a tablet at 100%, invisible but it drops most points of a
 * steady line.
 */
export function simplifyPoints(points: readonly InkPoint[], tolerance = 0.35): InkPoint[] {
  if (points.length <= 2) return points.map((p) => [...p] as InkPoint);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let worst = -1;
    let worstDistance = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i], points[first], points[last]);
      if (d > worstDistance) {
        worst = i;
        worstDistance = d;
      }
    }
    if (worst !== -1) {
      keep[worst] = 1;
      stack.push([first, worst], [worst, last]);
    }
  }
  return points.filter((_, i) => keep[i] === 1).map((p) => [...p] as InkPoint);
}

/** What is saved of a stroke that just ended: inside the page, rounded, simplified, no repeats. */
export function finishStroke(stroke: Omit<Stroke, "points"> & { points: readonly InkPoint[] }): Stroke {
  const rounded = stroke.points.map(quantizePoint);
  const unique = rounded.filter(
    (p, i) => i === 0 || p[0] !== rounded[i - 1][0] || p[1] !== rounded[i - 1][1] || p[2] !== rounded[i - 1][2],
  );
  return { ...stroke, size: round(stroke.size, 1), points: simplifyPoints(unique).slice(0, 5000) };
}
