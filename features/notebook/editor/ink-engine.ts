import {
  clampCamera,
  initialCamera,
  toPage,
  visibleRect,
  zoomAround,
  zoomPercent,
  type Camera,
  type Viewport,
} from "@/lib/ink/camera";
import { History } from "@/lib/ink/history";
import { InputArbiter, TwoFingerTap, type PointerKind } from "@/lib/ink/input";
import { drawLayer, drawStroke, outlinePath, strokeOutline, strokePath, type InkTheme } from "@/lib/ink/render";
import {
  finishStroke,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  type InkColor,
  type InkPoint,
  type InkTool,
  type Stroke,
} from "@/lib/ink/strokes";

/**
 * The notebook page on screen (section 7.2). Four layers: the paper (a CSS background, scaled by
 * the browser), the highlighters, the ink (finished strokes, drawn again only when the view or the
 * strokes change) and the live stroke (only the stroke being drawn, every frame). Pointer Events
 * with coalesced points for smooth lines and predicted points for low latency; the pen draws, the
 * palm is ignored, fingers scroll and zoom (lib/ink/input.ts).
 */

export interface EngineState {
  canUndo: boolean;
  canRedo: boolean;
  strokeCount: number;
  zoom: number;
}

export interface EngineOptions {
  viewport: HTMLDivElement;
  paper: HTMLDivElement;
  marker: HTMLCanvasElement;
  ink: HTMLCanvasElement;
  live: HTMLCanvasElement;
  strokes: Stroke[];
  theme: InkTheme;
  /** Space kept at the top for the floating toolbar. */
  top: number;
  fingerDraws: () => boolean;
  pen: () => { tool: InkTool; color: InkColor; size: number };
  /** False: the page is full, no new stroke. */
  canAdd: () => boolean;
  onState: (state: EngineState) => void;
  /** The page's strokes changed (to be saved). `added`: the stroke just drawn, if that was the change. */
  onStrokes: (strokes: Stroke[], added?: Stroke) => void;
}

interface Live {
  id: number;
  kind: PointerKind;
  stroke: Omit<Stroke, "points"> & { points: InkPoint[] };
  predicted: InkPoint[];
  /** Where the pointer is on screen (if it turns into a gesture finger). */
  screen: { x: number; y: number };
}

/** Redrawing everything each frame of a gesture only while it is this cheap. */
const LIVE_REDRAW_MS = 8;

let strokeSeq = 0;
const newStrokeId = () => `${Date.now().toString(36)}${(strokeSeq++ % 1296).toString(36).padStart(2, "0")}`;

export class InkEngine {
  private strokes: Stroke[];
  private theme: InkTheme;
  private history = new History<Stroke[]>();
  private arbiter: InputArbiter;
  private tap = new TwoFingerTap();
  private view: Viewport = { width: 0, height: 0, top: 0 };
  private cam: Camera = { x: 0, y: 0, z: 1 };
  /** The camera the ink layers were drawn with (a gesture moves them by CSS until drawn again). */
  private drawn: Camera | null = null;
  private lastRenderMs = 0;
  private dpr = 1;
  private live: Live | null = null;
  private gesture = new Map<number, { x: number; y: number }>();
  private rect: DOMRect | null = null;
  private frame = 0;
  private needs = { layers: false, live: false };
  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  private observer: ResizeObserver | null = null;
  private cleanup: (() => void)[] = [];

  constructor(private readonly o: EngineOptions) {
    this.strokes = o.strokes;
    this.theme = o.theme;
    this.arbiter = new InputArbiter(o.fingerDraws);
    this.listen();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(o.viewport);
    this.resize();
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.settleTimer);
    this.observer?.disconnect();
    for (const off of this.cleanup) off();
  }

  // --- Public actions ----------------------------------------------------------------------

  setTheme(theme: InkTheme) {
    this.theme = theme;
    this.request("layers");
  }

  /** The page changed elsewhere (another device): its strokes replace these. */
  replaceStrokes(strokes: Stroke[]) {
    this.strokes = strokes;
    this.request("layers");
    this.emit();
  }

  undo() {
    const previous = this.history.undo(this.strokes);
    if (!previous) return;
    this.cancelLive();
    this.strokes = previous;
    this.request("layers");
    this.o.onStrokes(this.strokes);
    this.emit();
  }

  redo() {
    const next = this.history.redo(this.strokes);
    if (!next) return;
    this.strokes = next;
    this.request("layers");
    this.o.onStrokes(this.strokes);
    this.emit();
  }

  zoomBy(factor: number) {
    this.moveCamera(
      zoomAround(
        this.cam,
        factor,
        { x: this.view.width / 2, y: this.view.top + (this.view.height - this.view.top) / 2 },
        this.view,
      ),
      true,
    );
  }

  fit() {
    this.moveCamera(initialCamera(this.view), true);
  }

  // --- Layout and drawing ------------------------------------------------------------------

  private resize() {
    const { viewport, marker, ink, live } = this.o;
    const first = this.view.width === 0;
    this.view = { width: viewport.clientWidth, height: viewport.clientHeight, top: this.o.top };
    if (this.view.width === 0) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const canvas of [marker, ink, live]) {
      canvas.width = Math.round(this.view.width * this.dpr);
      canvas.height = Math.round(this.view.height * this.dpr);
      canvas.style.width = `${this.view.width}px`;
      canvas.style.height = `${this.view.height}px`;
    }
    this.moveCamera(first ? initialCamera(this.view) : this.cam, true);
  }

  private moveCamera(next: Camera, settle: boolean) {
    this.cam = clampCamera(next, this.view);
    const { x, y, z } = this.cam;
    this.o.paper.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
    if (settle || this.lastRenderMs < LIVE_REDRAW_MS) {
      this.request("layers");
    } else if (this.drawn) {
      // Expensive page: move the last drawing by CSS during the gesture; draw again at its end.
      const s = z / this.drawn.z;
      const transform = `translate(${x - this.drawn.x * s}px, ${y - this.drawn.y * s}px) scale(${s})`;
      this.o.marker.style.transform = transform;
      this.o.ink.style.transform = transform;
    }
    this.emit();
  }

  private request(what: "layers" | "live") {
    this.needs[what] = true;
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.needs.layers) this.renderLayers();
      if (this.needs.live) this.renderLive();
      this.needs = { layers: false, live: false };
    });
  }

  private pageSpace(ctx: CanvasRenderingContext2D) {
    const { x, y, z } = this.cam;
    const d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(d * z, 0, 0, d * z, d * x, d * y);
  }

  private renderLayers() {
    const start = performance.now();
    const view = visibleRect(this.cam, this.view);
    for (const [canvas, layer] of [
      [this.o.marker, "marcador"],
      [this.o.ink, "tinta"],
    ] as const) {
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      this.pageSpace(ctx);
      drawLayer(ctx, this.strokes, layer, this.theme, view);
      canvas.style.transform = "";
    }
    this.drawn = { ...this.cam };
    this.lastRenderMs = performance.now() - start;
    performance.measure("lanima:ink-render", { start });
  }

  private renderLive() {
    const ctx = this.o.live.getContext("2d");
    if (!ctx) return;
    const start = performance.now();
    this.pageSpace(ctx);
    if (!this.live) return;
    const { stroke, predicted } = this.live;
    const points = predicted.length > 0 ? [...stroke.points, ...predicted] : stroke.points;
    const path = new Path2D(outlinePath(strokeOutline({ ...stroke, points }, false)));
    drawStroke(ctx, stroke, this.theme, path, false);
    performance.measure("lanima:ink-live", { start });
  }

  /** A finished stroke goes onto its layer without drawing the others again. */
  private drawFinished(stroke: Stroke) {
    const canvas = stroke.tool === "marca_texto" ? this.o.marker : this.o.ink;
    const ctx = canvas.getContext("2d");
    if (
      !ctx ||
      !this.drawn ||
      this.drawn.z !== this.cam.z ||
      this.drawn.x !== this.cam.x ||
      this.drawn.y !== this.cam.y
    ) {
      this.request("layers");
      return;
    }
    const d = this.dpr;
    ctx.setTransform(d * this.cam.z, 0, 0, d * this.cam.z, d * this.cam.x, d * this.cam.y);
    drawStroke(ctx, stroke, this.theme, strokePath(stroke), false);
  }

  private emit() {
    this.o.onState({
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      strokeCount: this.strokes.length,
      zoom: zoomPercent(this.cam, this.view),
    });
  }

  // --- Input -------------------------------------------------------------------------------

  private listen() {
    const v = this.o.viewport;
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      handler: (e: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      v.addEventListener(type, handler as EventListener, options);
      this.cleanup.push(() => v.removeEventListener(type, handler as EventListener, options));
    };
    on("pointerdown", (e) => this.down(e));
    on("pointermove", (e) => this.move(e));
    on("pointerup", (e) => this.up(e, false));
    on("pointercancel", (e) => this.up(e, true));
    on("lostpointercapture", (e) => {
      if (this.live?.id === e.pointerId) this.up(e, false);
    });
    on("wheel", (e) => this.wheel(e), { passive: false });
    // No long-press menu or text selection over the page.
    on("contextmenu", (e) => e.preventDefault());
  }

  private local(e: { clientX: number; clientY: number }): [number, number] {
    const rect = this.rect ?? this.o.viewport.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  private point(e: PointerEvent): InkPoint {
    const [sx, sy] = this.local(e);
    const [x, y] = toPage(this.cam, sx, sy);
    // Finger and mouse have no pressure: 0.5, and perfect-freehand simulates it from speed.
    const pressure = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5;
    return [x, y, pressure];
  }

  private kind(e: PointerEvent): PointerKind {
    return e.pointerType === "pen" ? "pen" : e.pointerType === "touch" ? "touch" : "mouse";
  }

  private down(e: PointerEvent) {
    this.rect = this.o.viewport.getBoundingClientRect();
    const kind = this.kind(e);
    // Pen: the tip only (the side button or the eraser end must not draw); mouse: the left button.
    const primary =
      kind === "pen" ? e.button === 0 && (e.buttons & ~1) === 0 : kind === "mouse" ? e.button === 0 : true;
    const decision = this.arbiter.down({ id: e.pointerId, kind, time: e.timeStamp, primary });
    const [sx, sy] = this.local(e);
    const drawingBefore = this.live;
    // A young finger stroke was the first finger of a gesture, or the palm before the pen: dropped.
    if (decision.cancelDrawing !== undefined && this.live?.id === decision.cancelDrawing) this.cancelLive();
    if (kind === "touch" && decision.role !== "ignore") this.tap.down(e.pointerId, sx, sy, e.timeStamp);
    if (decision.role === "ignore") return;
    e.preventDefault();
    if (decision.role === "gesture") {
      // The finger that was drawing joins the gesture; a stroke it had already made is kept.
      if (drawingBefore && this.arbiter.roleOf(drawingBefore.id) === "gesture") {
        if (this.live === drawingBefore) this.finishLive();
        this.gesture.set(drawingBefore.id, drawingBefore.screen);
      }
      this.gesture.set(e.pointerId, { x: sx, y: sy });
      return;
    }
    if (!this.o.canAdd()) return;
    try {
      this.o.viewport.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events in some tests have no capturable pointer.
    }
    const pen = this.o.pen();
    this.live = {
      id: e.pointerId,
      kind,
      stroke: { id: newStrokeId(), tool: pen.tool, color: pen.color, size: pen.size, points: [this.point(e)] },
      predicted: [],
      screen: { x: sx, y: sy },
    };
    this.o.live.style.mixBlendMode = pen.tool === "marca_texto" && this.theme === "light" ? "multiply" : "normal";
    this.request("live");
  }

  private move(e: PointerEvent) {
    if (this.live?.id === e.pointerId) {
      if (this.arbiter.roleOf(e.pointerId) !== "draw") return;
      const [sx, sy] = this.local(e);
      this.live.screen = { x: sx, y: sy };
      if (e.pointerType === "touch") this.tap.move(e.pointerId, sx, sy);
      const events = e.getCoalescedEvents?.() ?? [];
      for (const c of events.length > 0 ? events : [e]) this.live.stroke.points.push(this.point(c));
      this.live.predicted = (e.getPredictedEvents?.() ?? []).map((p) => this.point(p));
      this.request("live");
      return;
    }
    if (e.pointerType === "touch") {
      const [sx, sy] = this.local(e);
      this.tap.move(e.pointerId, sx, sy);
    }
    const previous = this.gesture.get(e.pointerId);
    if (!previous || this.arbiter.roleOf(e.pointerId) !== "gesture") return;
    const [sx, sy] = this.local(e);
    const points = [...this.gesture.entries()];
    this.gesture.set(e.pointerId, { x: sx, y: sy });
    if (points.length === 1) {
      this.moveCamera({ ...this.cam, x: this.cam.x + sx - previous.x, y: this.cam.y + sy - previous.y }, false);
      return;
    }
    // Two fingers: zoom by how far apart they are, around their middle, and follow the middle.
    const other = points.find(([id]) => id !== e.pointerId)?.[1];
    if (!other) return;
    const before = Math.hypot(previous.x - other.x, previous.y - other.y);
    const after = Math.hypot(sx - other.x, sy - other.y);
    const midBefore = { x: (previous.x + other.x) / 2, y: (previous.y + other.y) / 2 };
    const midAfter = { x: (sx + other.x) / 2, y: (sy + other.y) / 2 };
    const zoomed = before > 0 ? zoomAround(this.cam, after / before, midBefore, this.view) : this.cam;
    this.moveCamera(
      { ...zoomed, x: zoomed.x + midAfter.x - midBefore.x, y: zoomed.y + midAfter.y - midBefore.y },
      false,
    );
  }

  private up(e: PointerEvent, cancelled: boolean) {
    const kind = this.kind(e);
    if (this.live?.id === e.pointerId) {
      if (cancelled) this.cancelLive();
      else this.finishLive();
    }
    const tapped = kind === "touch" && this.tap.up(e.pointerId, e.timeStamp);
    this.arbiter.up(e.pointerId, kind, e.timeStamp);
    if (this.gesture.delete(e.pointerId) && this.gesture.size === 0) {
      clearTimeout(this.settleTimer);
      this.request("layers");
    }
    if (tapped && !cancelled) this.undo();
  }

  private wheel(e: WheelEvent) {
    e.preventDefault();
    const [sx, sy] = this.local(e);
    if (e.ctrlKey || e.metaKey) {
      this.moveCamera(zoomAround(this.cam, Math.exp(-e.deltaY * 0.01), { x: sx, y: sy }, this.view), false);
    } else {
      this.moveCamera({ ...this.cam, x: this.cam.x - e.deltaX, y: this.cam.y - e.deltaY }, false);
    }
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => this.request("layers"), 150);
  }

  private cancelLive() {
    this.live = null;
    this.request("live");
  }

  private finishLive() {
    const live = this.live;
    this.live = null;
    this.request("live");
    if (!live) return;
    const stroke = finishStroke(live.stroke);
    this.history.push(this.strokes);
    this.strokes = [...this.strokes, stroke];
    this.drawFinished(stroke);
    this.o.onStrokes(this.strokes, stroke);
    this.emit();
  }
}

/** The page's size on screen at 100% before the camera moves it (CSS px of page units). */
export const PAPER_SIZE = { width: PAGE_WIDTH, height: PAGE_HEIGHT };
