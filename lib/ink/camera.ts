import { PAGE_HEIGHT, PAGE_WIDTH } from "./strokes";

/**
 * Where the page is on the screen: a point of the page (page units) is drawn at
 * `x + px * z, y + py * z` in CSS px of the editor's viewport. Zoom (50–400%) is relative to the
 * page fitting the width ("100%").
 */
export interface Camera {
  x: number;
  y: number;
  z: number;
}

export interface Viewport {
  width: number;
  height: number;
  /** Space kept free at the top (the floating toolbar). */
  top: number;
}

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4;
/** At 100% the page is never wider than this (a big landscape screen). */
const MAX_PAGE_CSS = 900;

const margin = (view: Viewport) => (view.width < 600 ? 12 : 24);

/** Page units → CSS px when the page fits the width: what "100%" means. */
export function fitScale(view: Viewport): number {
  return Math.max(Math.min(view.width - 2 * margin(view), MAX_PAGE_CSS), 100) / PAGE_WIDTH;
}

export function initialCamera(view: Viewport): Camera {
  const z = fitScale(view);
  return clampCamera({ x: 0, y: view.top, z }, view);
}

/**
 * Keeps the page reachable: centered when narrower than the screen, else its edges within a margin;
 * vertically from below the toolbar to its bottom with a margin.
 */
export function clampCamera(cam: Camera, view: Viewport): Camera {
  const m = margin(view);
  const w = PAGE_WIDTH * cam.z;
  const h = PAGE_HEIGHT * cam.z;
  const x = w + 2 * m <= view.width ? (view.width - w) / 2 : Math.min(Math.max(cam.x, view.width - w - m), m);
  const free = view.height - view.top - m;
  const y = h <= free ? view.top : Math.min(Math.max(cam.y, view.height - h - m), view.top);
  return { x, y, z: cam.z };
}

/** Zooms by `factor` keeping the screen point `at` still (pinch, wheel, buttons). */
export function zoomAround(cam: Camera, factor: number, at: { x: number; y: number }, view: Viewport): Camera {
  const fit = fitScale(view);
  const z = Math.min(Math.max(cam.z * factor, fit * ZOOM_MIN), fit * ZOOM_MAX);
  const k = z / cam.z;
  return clampCamera({ x: at.x - (at.x - cam.x) * k, y: at.y - (at.y - cam.y) * k, z }, view);
}

export function zoomPercent(cam: Camera, view: Viewport): number {
  return Math.round((cam.z / fitScale(view)) * 100);
}

/** A screen point (CSS px in the viewport) in page units. */
export function toPage(cam: Camera, sx: number, sy: number): [number, number] {
  return [(sx - cam.x) / cam.z, (sy - cam.y) / cam.z];
}

/** The part of the page on screen, in page units, for drawing only what shows. */
export function visibleRect(cam: Camera, view: Viewport) {
  const [x0, y0] = toPage(cam, 0, 0);
  const [x1, y1] = toPage(cam, view.width, view.height);
  return { x0, y0, x1, y1 };
}
