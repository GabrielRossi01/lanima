/**
 * Who does what on the page (section 7.2). The pen draws; while a pen is down (and a moment after)
 * touches are the palm and are ignored. Fingers scroll (one) and zoom (two), unless "Desenhar com o
 * dedo" is on: then one finger draws and two scroll and zoom. Pure, so the rules are tested.
 */

export type PointerKind = "pen" | "touch" | "mouse";
export type Role = "draw" | "gesture" | "ignore";

/** After the pen lifts, the hand still rests on the screen for a moment. */
export const PALM_GRACE_MS = 600;
/** A finger stroke this young is a mistake when a second finger lands: it becomes a gesture. */
export const SECOND_FINGER_MS = 300;

export interface PointerDown {
  id: number;
  kind: PointerKind;
  time: number;
  /** Mouse: left button. Pen: the tip (no side or eraser button). */
  primary: boolean;
}

export interface Decision {
  role: Role;
  /** A finger stroke under way that must be dropped (the finger was the start of a gesture). */
  cancelDrawing?: number;
}

export class InputArbiter {
  private pens = new Set<number>();
  private lastPenUp = -Infinity;
  /** Touches being used for a gesture, and the one drawing (if any) with its start. */
  private gesture = new Set<number>();
  private drawing: { id: number; kind: PointerKind; since: number } | null = null;
  private ignored = new Set<number>();

  constructor(private readonly fingerDraws: () => boolean) {}

  down(p: PointerDown): Decision {
    if (p.kind === "pen") {
      this.pens.add(p.id);
      // The pen wins over a finger: a finger stroke or gesture under way was the palm.
      const cancel = this.drawing && this.drawing.kind === "touch" ? this.drawing.id : undefined;
      for (const id of this.gesture) this.ignored.add(id);
      this.gesture.clear();
      if (!p.primary) {
        this.drawing = null;
        return { role: "ignore", cancelDrawing: cancel };
      }
      this.drawing = { id: p.id, kind: "pen", since: p.time };
      return { role: "draw", cancelDrawing: cancel };
    }

    if (p.kind === "mouse") {
      if (!p.primary) {
        this.gesture.add(p.id);
        return { role: "gesture" };
      }
      this.drawing = { id: p.id, kind: "mouse", since: p.time };
      return { role: "draw" };
    }

    // Touch.
    if (this.pens.size > 0 || p.time - this.lastPenUp < PALM_GRACE_MS || this.drawing?.kind === "pen") {
      this.ignored.add(p.id);
      return { role: "ignore" };
    }
    if (this.fingerDraws()) {
      if (!this.drawing && this.gesture.size === 0) {
        this.drawing = { id: p.id, kind: "touch", since: p.time };
        return { role: "draw" };
      }
      if (this.drawing?.kind === "touch") {
        // Two fingers: scroll and zoom. A young stroke of the first finger is dropped.
        const first = this.drawing;
        this.drawing = null;
        this.gesture.add(first.id);
        this.gesture.add(p.id);
        return { role: "gesture", cancelDrawing: p.time - first.since < SECOND_FINGER_MS ? first.id : undefined };
      }
    }
    this.gesture.add(p.id);
    return { role: "gesture" };
  }

  /** The role a pointer has now (a finger can turn from drawing into a gesture). */
  roleOf(id: number): Role {
    if (this.drawing?.id === id) return "draw";
    if (this.gesture.has(id)) return "gesture";
    return "ignore";
  }

  up(id: number, kind: PointerKind, time: number) {
    if (kind === "pen") {
      this.pens.delete(id);
      this.lastPenUp = time;
    }
    if (this.drawing?.id === id) this.drawing = null;
    this.gesture.delete(id);
    this.ignored.delete(id);
  }

  gestureCount(): number {
    return this.gesture.size;
  }
}

/** Two fingers touching and lifting quickly, without moving: undo (section 7.2). */
export class TwoFingerTap {
  static readonly MAX_MS = 300;
  static readonly MAX_MOVE = 12;
  private touches = new Map<number, { x: number; y: number; time: number; moved: boolean }>();
  private count = 0;
  private start = 0;
  private failed = false;

  down(id: number, x: number, y: number, time: number) {
    if (this.touches.size === 0) {
      this.count = 0;
      this.start = time;
      this.failed = false;
    }
    this.touches.set(id, { x, y, time, moved: false });
    this.count++;
    if (this.count > 2) this.failed = true;
  }

  move(id: number, x: number, y: number) {
    const t = this.touches.get(id);
    if (t && Math.hypot(x - t.x, y - t.y) > TwoFingerTap.MAX_MOVE) this.failed = true;
  }

  /** True when this lift completes a two-finger tap. */
  up(id: number, time: number): boolean {
    if (!this.touches.delete(id)) return false;
    if (this.touches.size > 0) return false;
    return !this.failed && this.count === 2 && time - this.start <= TwoFingerTap.MAX_MS;
  }

  cancel() {
    this.failed = true;
  }
}
