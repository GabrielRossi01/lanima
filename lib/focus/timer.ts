import { z } from "zod";

/**
 * Focus timer. The time always comes from timestamps (`startedAt` and `pausedDuration`), never from
 * counting ticks: it stays right in the background, after a reload or with the app closed. Pure
 * functions: every one takes the current time, so they are unit-tested without a clock.
 */
export const SESSIONS_PER_CYCLE = 4;
export const FOCUS_LIMITS = { min: 5, max: 180 } as const;
export const BREAK_LIMITS = { min: 1, max: 60 } as const;

export const presetSchema = z.object({
  focusMin: z.number().int().min(FOCUS_LIMITS.min).max(FOCUS_LIMITS.max),
  breakMin: z.number().int().min(BREAK_LIMITS.min).max(BREAK_LIMITS.max),
});
export type Preset = z.infer<typeof presetSchema>;

export const PRESETS: readonly Preset[] = [
  { focusMin: 25, breakMin: 5 },
  { focusMin: 50, breakMin: 10 },
  { focusMin: 90, breakMin: 15 },
];

export const timerSchema = z.object({
  preset: presetSchema,
  phase: z.enum(["focus", "break"]),
  /** 1 to 4: position in the cycle. */
  session: z.number().int().min(1).max(SESSIONS_PER_CYCLE),
  /** Epoch ms; null while the phase hasn't started. */
  startedAt: z.number().nullable(),
  /** Epoch ms; null while running. */
  pausedAt: z.number().nullable(),
  /** Total ms spent in pauses that already ended. */
  pausedDuration: z.number().min(0),
  subjectId: z.string().nullable(),
  topicId: z.string().nullable(),
  /** Newest write wins between tabs. */
  updatedAt: z.number(),
});
export type TimerState = z.infer<typeof timerSchema>;

export function initialTimer(): TimerState {
  return {
    preset: PRESETS[0],
    phase: "focus",
    session: 1,
    startedAt: null,
    pausedAt: null,
    pausedDuration: 0,
    subjectId: null,
    topicId: null,
    updatedAt: 0,
  };
}

export type TimerStatus = "idle" | "running" | "paused";

export function statusOf(timer: TimerState): TimerStatus {
  if (timer.startedAt === null) return "idle";
  return timer.pausedAt === null ? "running" : "paused";
}

/** Length of the current phase, in ms. */
export function plannedMs(timer: TimerState): number {
  return (timer.phase === "focus" ? timer.preset.focusMin : timer.preset.breakMin) * 60_000;
}

export function elapsedMs(timer: TimerState, now: number): number {
  if (timer.startedAt === null) return 0;
  const until = timer.pausedAt ?? now;
  // Never negative: the device clock may be moved back.
  return Math.max(0, until - timer.startedAt - timer.pausedDuration);
}

export function remainingMs(timer: TimerState, now: number): number {
  return Math.max(0, plannedMs(timer) - elapsedMs(timer, now));
}

export function isOver(timer: TimerState, now: number): boolean {
  return statusOf(timer) === "running" && remainingMs(timer, now) === 0;
}

export function start(timer: TimerState, now: number): TimerState {
  if (timer.startedAt === null) return { ...timer, startedAt: now, pausedAt: null, pausedDuration: 0 };
  if (timer.pausedAt === null) return timer;
  // Resume: the pause that ends now joins the total.
  return { ...timer, pausedAt: null, pausedDuration: timer.pausedDuration + Math.max(0, now - timer.pausedAt) };
}

export function pause(timer: TimerState, now: number): TimerState {
  return statusOf(timer) === "running" ? { ...timer, pausedAt: now } : timer;
}

/** Back to the start of the current phase, stopped. */
export function reset(timer: TimerState): TimerState {
  return { ...timer, startedAt: null, pausedAt: null, pausedDuration: 0 };
}

/** Next phase, stopped: focus → break, break → next focus (1 to 4, then 1 again). */
export function advance(timer: TimerState): TimerState {
  if (timer.phase === "focus") return { ...reset(timer), phase: "break" };
  return { ...reset(timer), phase: "focus", session: (timer.session % SESSIONS_PER_CYCLE) + 1 };
}

/** Ends what is going on, without completing it: ready for the next focus. */
export function endSession(timer: TimerState): TimerState {
  return timer.phase === "break" ? advance(timer) : reset(timer);
}

/** A break that was never started isn't offered forever outside the focus screen. */
export const PENDING_BREAK_MS = 30 * 60_000;

/** Whether there is something going on to show outside the focus screen. */
export function showsIndicator(timer: TimerState, now: number): boolean {
  if (statusOf(timer) !== "idle") return true;
  return timer.phase === "break" && now - timer.updatedAt < PENDING_BREAK_MS;
}

/** Only before the phase starts: changing the length of a running session would falsify it. */
export function choosePreset(timer: TimerState, preset: Preset): TimerState {
  return timer.startedAt === null ? { ...timer, preset } : timer;
}

export function samePreset(a: Preset, b: Preset): boolean {
  return a.focusMin === b.focusMin && a.breakMin === b.breakMin;
}

/** "25:00", "04:09", "120:00". Rounded up, so it reads 25:00 at the start and 00:00 only at the end. */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** ms until the shown second changes. */
export function msToNextSecond(remaining: number): number {
  return remaining <= 0 ? 0 : remaining % 1000 || 1000;
}
