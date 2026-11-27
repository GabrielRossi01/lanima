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
import {
  elementBox,
  elementInLasso,
  eraseArea,
  moveStroke,
  strokeInLasso,
  touchesStroke,
  unionBox,
  type Box,
} from "@/lib/ink/erase";
import { History } from "@/lib/ink/history";
import { InputArbiter, TwoFingerTap, type PointerKind } from "@/lib/ink/input";
import {
  drawLayer,
  drawStroke,
  outlinePath,
  strokeBounds,
  strokeOutline,
  strokePath,
  type InkTheme,
} from "@/lib/ink/render";
import { finishStroke, PAGE_WIDTH, type InkColor, type InkPoint, type InkTool, type Stroke } from "@/lib/ink/strokes";
import type { PageElement, TextElement } from "@/lib/notebook/model";

/**
 * The notebook page on screen (section 7.2). Layers: the paper (a CSS background scaled by the
 * browser, with the text boxes and pictures on it), the highlighters, the ink (finished strokes,
 * drawn again only when the view or the strokes change) and the live layer (the stroke being drawn,
 * the eraser ring, the lasso). Pointer Events with coalesced points for smooth lines and predicted
 * points for low latency; the pen draws, the palm is ignored, fingers scroll and zoom
 * (lib/ink/input.ts); the pen's side button erases while pressed.
 */

export interface PageDoc {
  strokes: Stroke[];
  elements: PageElement[];
}

export interface EngineState {
  canUndo: boolean;
  canRedo: boolean;
  strokeCount: number;
  zoom: number;
  elements: PageElement[];
  /** Selected by the lasso, with its box on screen (CSS px of the viewport). */
  selection: { count: number; screen: { x: number; y: number; w: number; h: number }; elementIds: string[] } | null;
  /** The selection being dragged, in page units. */
  moving: { dx: number; dy: number } | null;
}

export type ToolChoice =
  | { tool: InkTool; color: InkColor; size: number }
  | { tool: "borracha"; mode: "traco" | "area"; radius: number; reach: number }
  | { tool: "laco" }
  | { tool: "texto" };

export interface EngineOptions {
  viewport: HTMLDivElement;
  paper: HTMLDivElement;
  marker: HTMLCanvasElement;
  ink: HTMLCanvasElement;
  live: HTMLCanvasElement;
  doc: PageDoc;
  theme: InkTheme;
  /** Space kept at the top for the floating toolbar. */
  top: number;
  fingerDraws: () => boolean;
  tool: () => ToolChoice;
  /** The eraser the pen's side button gives. */
  sideEraser: () => { radius: number; reach: number };
  /** False: the page is full, nothing new. */
  canAdd: () => boolean;
  onState: (state: EngineState) => void;
  /** The page changed (to be saved). `added`: the stroke just drawn, if that was the change. */
  onDoc: (doc: PageDoc, added?: Stroke) => void;
  /** A new text box: the screen puts the cursor in it. */
  onTextCreated: (id: string) => void;
}

type Action =
  | {
      kind: "ink";
      id: number;
      stroke: Omit<Stroke, "points"> & { points: InkPoint[] };
      predicted: InkPoint[];
      screen: { x: number; y: number };
    }
  | {
      kind: "erase";
      id: number;
      mode: "traco" | "area";
      radius: number;
      reach: number;
      before: PageDoc;
      changed: boolean;
      at: [number, number];
      screen: { x: number; y: number };
    }
  | { kind: "lasso"; id: number; points: [number, number][]; screen: { x: number; y: number } }
  | { kind: "move"; id: number; from: [number, number]; dx: number; dy: number; screen: { x: number; y: number } }
  | {
      kind: "text";
      id: number;
      at: [number, number];
      start: { x: number; y: number };
      screen: { x: number; y: number };
    };

interface Selection {
  strokes: Set<string>;
  elements: Set<string>;
}

/** Redrawing everything each frame of a gesture only while it is this cheap. */
const LIVE_REDRAW_MS = 8;
/** A press that moves less than this (CSS px) is a tap. */
const TAP_SLOP = 8;
const TEXT_SIZE = 24;

let seq = 0;
export const newPageItemId = () => `${Date.now().toString(36)}${(seq++ % 1296).toString(36).padStart(2, "0")}`;

export class InkEngine {
  private doc: PageDoc;
  private theme: InkTheme;
  private history = new History<PageDoc>();
  private arbiter: InputArbiter;
  private tap = new TwoFingerTap();
  private view: Viewport = { width: 0, height: 0, top: 0 };
  private cam: Camera = { x: 0, y: 0, z: 1 };
  /** The camera the ink layers were drawn with (a gesture moves them by CSS until drawn again). */
  private drawn: Camera | null = null;
  private lastRenderMs = 0;
  private dpr = 1;
  private action: Action | null = null;
  private selection: Selection | null = null;
  /** The page before a text box was opened for writing (one undo step per box edited). */
  private editing: { id: string; before: PageDoc } | null = null;
  private gesture = new Map<number, { x: number; y: number }>();
  private rect: DOMRect | null = null;
  private frame = 0;
  private needs = { layers: false, live: false };
  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  private observer: ResizeObserver | null = null;
  private cleanup: (() => void)[] = [];

  constructor(private readonly o: EngineOptions) {
    this.doc = o.doc;
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

  /** The page changed elsewhere (another device): it replaces this one. */
  replaceDoc(doc: PageDoc) {
    this.doc = doc;
    this.selection = null;
    this.request("layers");
    this.emit();
  }

  undo() {
    this.closeEditing();
    const previous = this.history.undo(this.doc);
    if (!previous) return;
    this.cancelAction();
    this.apply(previous);
  }

  redo() {
    this.closeEditing();
    const next = this.history.redo(this.doc);
    if (!next) return;
    this.apply(next);
  }

  zoomBy(factor: number) {
    const middle = { x: this.view.width / 2, y: this.view.top + (this.view.height - this.view.top) / 2 };
    this.moveCamera(zoomAround(this.cam, factor, middle, this.view), true);
  }

  fit() {
    this.moveCamera(initialCamera(this.view), true);
  }

  /** A picture (or anything placed by a button), as one step to undo. */
  addElement(element: PageElement) {
    this.history.push(this.doc);
    this.commit({ ...this.doc, elements: [...this.doc.elements, element] });
  }

  /** The middle of what is on screen, in page units (where a picture goes). */
  visibleCenter(): [number, number] {
    const v = visibleRect(this.cam, this.view);
    const [, top] = toPage(this.cam, 0, this.view.top);
    return [(v.x0 + v.x1) / 2, (Math.max(v.y0, top) + v.y1) / 2];
  }

  /** She started writing in a text box. */
  beginText(id: string) {
    if (this.editing?.id === id) return;
    this.closeEditing();
    this.editing = { id, before: this.doc };
  }

  /** Each change of a text box's text: saved, but one undo step for the whole box. */
  setText(id: string, text: string) {
    const elements = this.doc.elements.map((e) => (e.id === id && e.type === "texto" ? { ...e, text } : e));
    this.doc = { ...this.doc, elements };
    this.o.onDoc(this.doc);
    this.emit();
  }

  /** She left the text box: an empty one goes away; a changed one becomes an undo step. */
  endText(id: string) {
    if (this.editing?.id === id) this.closeEditing();
  }

  deleteSelection() {
    const selection = this.selection;
    if (!selection) return;
    this.history.push(this.doc);
    this.selection = null;
    this.commit({
      strokes: this.doc.strokes.filter((s) => !selection.strokes.has(s.id)),
      elements: this.doc.elements.filter((e) => !selection.elements.has(e.id)),
    });
  }

  clearSelection() {
    if (!this.selection) return;
    this.selection = null;
    this.emit();
  }

  // --- The page ----------------------------------------------------------------------------

  private apply(doc: PageDoc) {
    this.selection = null;
    this.doc = doc;
    this.request("layers");
    this.o.onDoc(this.doc);
    this.emit();
  }

  private commit(doc: PageDoc, added?: Stroke) {
    this.doc = doc;
    if (added) this.drawFinished(added);
    else this.request("layers");
    this.o.onDoc(this.doc, added);
    this.emit();
  }

  private closeEditing() {
    const editing = this.editing;
    if (!editing) return;
    this.editing = null;
    const box = this.doc.elements.find((e): e is TextElement => e.id === editing.id && e.type === "texto");
    if (box && box.text.trim() === "") {
      const elements = this.doc.elements.filter((e) => e.id !== editing.id);
      this.doc = { ...this.doc, elements };
      this.o.onDoc(this.doc);
      this.emit();
    }
    const before = JSON.stringify(editing.before.elements);
    if (JSON.stringify(this.doc.elements) !== before) this.history.push(editing.before);
    this.emit();
  }

  private selectionBox(selection: Selection): Box | null {
    return unionBox([
      ...this.doc.strokes.filter((s) => selection.strokes.has(s.id)).map(strokeBounds),
      ...this.doc.elements.filter((e) => selection.elements.has(e.id)).map(elementBox),
    ]);
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
    const moving = this.action?.kind === "move" && this.selection ? this.action : null;
    const still = moving ? this.doc.strokes.filter((s) => !this.selection!.strokes.has(s.id)) : this.doc.strokes;
    const moved = moving ? this.doc.strokes.filter((s) => this.selection!.strokes.has(s.id)) : [];
    for (const [canvas, layer] of [
      [this.o.marker, "marcador"],
      [this.o.ink, "tinta"],
    ] as const) {
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      this.pageSpace(ctx);
      drawLayer(ctx, still, layer, this.theme, view);
      if (moving) {
        ctx.translate(moving.dx, moving.dy);
        drawLayer(ctx, moved, layer, this.theme, { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 });
      }
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
    const action = this.action;
    if (!action) return;
    if (action.kind === "ink") {
      const { stroke, predicted } = action;
      const points = predicted.length > 0 ? [...stroke.points, ...predicted] : stroke.points;
      const path = new Path2D(outlinePath(strokeOutline({ ...stroke, points }, false)));
      drawStroke(ctx, stroke, this.theme, path, false);
      performance.measure("lanima:ink-live", { start });
    } else if (action.kind === "erase") {
      // The eraser's ring under the pen.
      ctx.beginPath();
      ctx.arc(action.at[0], action.at[1], action.mode === "area" ? action.radius : action.reach + 4, 0, Math.PI * 2);
      ctx.lineWidth = 1.5 / this.cam.z;
      ctx.strokeStyle = this.theme === "light" ? "#5D7A8C" : "#9FB5C4";
      ctx.stroke();
    } else if (action.kind === "lasso" && action.points.length > 1) {
      ctx.beginPath();
      action.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.lineWidth = 1.5 / this.cam.z;
      ctx.setLineDash([6 / this.cam.z, 5 / this.cam.z]);
      ctx.strokeStyle = this.theme === "light" ? "#3E5566" : "#C2CFD8";
      ctx.stroke();
    }
  }

  /** A finished stroke goes onto its layer without drawing the others again. */
  private drawFinished(stroke: Stroke) {
    const canvas = stroke.tool === "marca_texto" ? this.o.marker : this.o.ink;
    const ctx = canvas.getContext("2d");
    const same =
      this.drawn && this.drawn.z === this.cam.z && this.drawn.x === this.cam.x && this.drawn.y === this.cam.y;
    if (!ctx || !same) {
      this.request("layers");
      return;
    }
    const d = this.dpr;
    ctx.setTransform(d * this.cam.z, 0, 0, d * this.cam.z, d * this.cam.x, d * this.cam.y);
    drawStroke(ctx, stroke, this.theme, strokePath(stroke), false);
  }

  private emit() {
    const selection = this.selection;
    const box = selection ? this.selectionBox(selection) : null;
    const moving = this.action?.kind === "move" ? { dx: this.action.dx, dy: this.action.dy } : null;
    const pad = 8;
    this.o.onState({
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      strokeCount: this.doc.strokes.length,
      zoom: zoomPercent(this.cam, this.view),
      elements: this.doc.elements,
      moving,
      selection:
        selection && box
          ? {
              count: selection.strokes.size + selection.elements.size,
              elementIds: [...selection.elements],
              screen: {
                x: this.cam.x + (box.x0 - pad + (moving?.dx ?? 0)) * this.cam.z,
                y: this.cam.y + (box.y0 - pad + (moving?.dy ?? 0)) * this.cam.z,
                w: (box.x1 - box.x0 + 2 * pad) * this.cam.z,
                h: (box.y1 - box.y0 + 2 * pad) * this.cam.z,
              },
            }
          : null,
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
      if (this.action?.id === e.pointerId) this.up(e, false);
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

  private capture(e: PointerEvent) {
    try {
      this.o.viewport.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events in some tests have no capturable pointer.
    }
  }

  private down(e: PointerEvent) {
    // A text box being written in takes its own presses.
    if ((e.target as Element | null)?.closest?.("[data-elemento-ativo]")) return;
    this.rect = this.o.viewport.getBoundingClientRect();
    const kind = this.kind(e);
    // Pen: the tip draws; the side button or the eraser end erase. Mouse: the left button.
    const primary =
      kind === "pen" ? e.button === 0 && (e.buttons & ~1) === 0 : kind === "mouse" ? e.button === 0 : true;
    const decision = this.arbiter.down({ id: e.pointerId, kind, time: e.timeStamp, primary });
    const [sx, sy] = this.local(e);
    const screen = { x: sx, y: sy };
    const before = this.action;
    // A young finger stroke was the first finger of a gesture, or the palm before the pen: dropped.
    if (decision.cancelDrawing !== undefined && this.action?.id === decision.cancelDrawing) this.cancelAction();
    if (kind === "touch" && decision.role !== "ignore") this.tap.down(e.pointerId, sx, sy, e.timeStamp);
    if (decision.role === "ignore") return;
    e.preventDefault();
    if (decision.role === "gesture") {
      // The finger that was drawing joins the gesture; a stroke it had already made is kept.
      if (before && this.arbiter.roleOf(before.id) === "gesture") {
        if (this.action === before) this.finishAction();
        this.gesture.set(before.id, before.screen);
      }
      this.gesture.set(e.pointerId, screen);
      return;
    }
    // Pressing the page closes a text box being written in.
    this.closeEditing();
    const [x, y] = toPage(this.cam, sx, sy);
    if (decision.role === "erase") {
      const side = this.o.sideEraser();
      this.startErase(e, "traco", side.radius, side.reach, [x, y], screen);
      return;
    }
    const choice = this.o.tool();
    if (choice.tool === "borracha") {
      this.startErase(e, choice.mode, choice.radius, choice.reach, [x, y], screen);
      return;
    }
    if (choice.tool === "laco") {
      const box = this.selection ? this.selectionBox(this.selection) : null;
      this.capture(e);
      if (box && x >= box.x0 - 8 && x <= box.x1 + 8 && y >= box.y0 - 8 && y <= box.y1 + 8) {
        this.action = { kind: "move", id: e.pointerId, from: [x, y], dx: 0, dy: 0, screen };
      } else {
        this.selection = null;
        this.action = { kind: "lasso", id: e.pointerId, points: [[x, y]], screen };
        this.emit();
      }
      return;
    }
    if (choice.tool === "texto") {
      this.capture(e);
      this.action = { kind: "text", id: e.pointerId, at: [x, y], start: screen, screen };
      return;
    }
    if (!this.o.canAdd()) return;
    this.capture(e);
    this.clearSelection();
    this.action = {
      kind: "ink",
      id: e.pointerId,
      stroke: {
        id: newPageItemId(),
        tool: choice.tool,
        color: choice.color,
        size: choice.size,
        points: [this.point(e)],
      },
      predicted: [],
      screen,
    };
    this.o.live.style.mixBlendMode = choice.tool === "marca_texto" && this.theme === "light" ? "multiply" : "normal";
    this.request("live");
  }

  private startErase(
    e: PointerEvent,
    mode: "traco" | "area",
    radius: number,
    reach: number,
    at: [number, number],
    screen: { x: number; y: number },
  ) {
    this.capture(e);
    this.clearSelection();
    this.action = { kind: "erase", id: e.pointerId, mode, radius, reach, before: this.doc, changed: false, at, screen };
    this.eraseAt(at[0], at[1]);
    this.request("live");
  }

  private eraseAt(x: number, y: number) {
    const action = this.action;
    if (action?.kind !== "erase") return;
    action.at = [x, y];
    const reach = action.mode === "area" ? action.radius : action.reach;
    let changed = false;
    const strokes: Stroke[] = [];
    for (const stroke of this.doc.strokes) {
      const b = strokeBounds(stroke);
      if (x < b.x0 - reach || x > b.x1 + reach || y < b.y0 - reach || y > b.y1 + reach) {
        strokes.push(stroke);
        continue;
      }
      if (action.mode === "traco") {
        if (touchesStroke(stroke, x, y, reach)) changed = true;
        else strokes.push(stroke);
      } else {
        const pieces = eraseArea(stroke, x, y, reach, newPageItemId);
        if (pieces === null) strokes.push(stroke);
        else {
          changed = true;
          strokes.push(...pieces);
        }
      }
    }
    if (changed) {
      action.changed = true;
      this.doc = { ...this.doc, strokes };
      this.request("layers");
      this.emit();
    }
  }

  private move(e: PointerEvent) {
    const action = this.action;
    if (action?.id === e.pointerId) {
      const role = this.arbiter.roleOf(e.pointerId);
      if (role !== "draw" && role !== "erase") return;
      const [sx, sy] = this.local(e);
      action.screen = { x: sx, y: sy };
      if (e.pointerType === "touch") this.tap.move(e.pointerId, sx, sy);
      const events = e.getCoalescedEvents?.() ?? [];
      const all = events.length > 0 ? events : [e];
      if (action.kind === "ink") {
        for (const c of all) action.stroke.points.push(this.point(c));
        action.predicted = (e.getPredictedEvents?.() ?? []).map((p) => this.point(p));
        this.request("live");
      } else if (action.kind === "erase") {
        for (const c of all) {
          const [x, y] = this.point(c);
          this.eraseAt(x, y);
        }
        this.request("live");
      } else if (action.kind === "lasso") {
        for (const c of all) {
          const [x, y] = this.point(c);
          action.points.push([x, y]);
        }
        this.request("live");
      } else if (action.kind === "move") {
        const [x, y] = this.point(e);
        action.dx = x - action.from[0];
        action.dy = y - action.from[1];
        this.request("layers");
        this.emit();
      }
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
    if (this.action?.id === e.pointerId) {
      if (cancelled) this.cancelAction();
      else this.finishAction();
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

  private cancelAction() {
    const action = this.action;
    this.action = null;
    // An erase cut short puts back what it took.
    if (action?.kind === "erase" && action.changed) {
      this.doc = action.before;
      this.request("layers");
    }
    if (action?.kind === "move") this.request("layers");
    this.request("live");
    this.emit();
  }

  private finishAction() {
    const action = this.action;
    this.action = null;
    this.request("live");
    if (!action) return;
    switch (action.kind) {
      case "ink": {
        const stroke = finishStroke(action.stroke);
        this.history.push(this.doc);
        this.commit({ ...this.doc, strokes: [...this.doc.strokes, stroke] }, stroke);
        return;
      }
      case "erase":
        if (action.changed) {
          this.history.push(action.before);
          this.commit(this.doc);
        }
        this.emit();
        return;
      case "lasso": {
        const polygon = action.points;
        const selection: Selection = {
          strokes: new Set(
            polygon.length > 2 ? this.doc.strokes.filter((s) => strokeInLasso(s, polygon)).map((s) => s.id) : [],
          ),
          elements: new Set(
            polygon.length > 2 ? this.doc.elements.filter((el) => elementInLasso(el, polygon)).map((el) => el.id) : [],
          ),
        };
        this.selection = selection.strokes.size + selection.elements.size > 0 ? selection : null;
        this.emit();
        return;
      }
      case "move": {
        const selection = this.selection;
        const { dx, dy } = action;
        if (!selection || Math.hypot(dx, dy) < 0.5) {
          this.request("layers");
          this.emit();
          return;
        }
        this.history.push(this.doc);
        const round = (n: number) => Math.round(n * 10) / 10;
        this.commit({
          strokes: this.doc.strokes.map((s) => (selection.strokes.has(s.id) ? moveStroke(s, dx, dy) : s)),
          elements: this.doc.elements.map((el) =>
            selection.elements.has(el.id) ? { ...el, x: round(el.x + dx), y: round(el.y + dy) } : el,
          ),
        });
        return;
      }
      case "text": {
        if (Math.hypot(action.screen.x - action.start.x, action.screen.y - action.start.y) > TAP_SLOP) return;
        if (!this.o.canAdd()) return;
        const [x, y] = action.at;
        const left = Math.min(Math.max(x, 20), PAGE_WIDTH - 140);
        const box: TextElement = {
          id: newPageItemId(),
          type: "texto",
          x: Math.round(left * 10) / 10,
          y: Math.round(Math.max(y - TEXT_SIZE * 0.7, 0) * 10) / 10,
          w: Math.min(440, PAGE_WIDTH - 20 - left),
          text: "",
          size: TEXT_SIZE,
        };
        this.editing = { id: box.id, before: this.doc };
        this.doc = { ...this.doc, elements: [...this.doc.elements, box] };
        this.emit();
        this.o.onTextCreated(box.id);
        return;
      }
    }
  }
}
