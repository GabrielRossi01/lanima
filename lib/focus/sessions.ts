import { z } from "zod";
import { addDays, todayIn, type IsoDate } from "@/lib/dates/calendar";
import { plannedMs, statusOf, type TimerState } from "./timer";

/**
 * Completed focus sessions and what is counted from them. Only completed ones exist: skipping or
 * restarting records nothing, and paused time doesn't count. Pure functions.
 */
export const focusSessionSchema = z.object({
  /** Epoch ms. One session per start: it identifies the session on the device and in the database. */
  startedAt: z.number(),
  endedAt: z.number(),
  minutes: z.number().int().min(0).max(180),
  subjectId: z.string().nullable(),
});
export type FocusSession = z.infer<typeof focusSessionSchema>;

/** What the server has: recent sessions one by one, older ones added up by day. */
export interface FocusHistory {
  sessions: FocusSession[];
  days: { day: IsoDate; minutes: number }[];
}

/** Days, up to today, whose sessions are loaded one by one. */
export const RECENT_DAYS = 30;
/** Minutes of focus that make a day count for the streak (section 5). */
export const STREAK_MIN = 25;

/** The session that ends when the time is up, at the moment it was up (not when the app noticed). */
export function sessionOf(timer: TimerState): FocusSession | null {
  if (timer.phase !== "focus" || timer.startedAt === null || statusOf(timer) !== "running") return null;
  return {
    startedAt: timer.startedAt,
    endedAt: timer.startedAt + timer.pausedDuration + plannedMs(timer),
    minutes: timer.preset.focusMin,
    subjectId: timer.subjectId,
  };
}

/** A session belongs to the day it ended, in São Paulo. */
export function dayOfSession(session: FocusSession): IsoDate {
  return todayIn(new Date(session.endedAt));
}

/** First day loaded one by one. */
export function recentSince(today: IsoDate): IsoDate {
  return addDays(today, -RECENT_DAYS);
}

export interface FocusSummary {
  /** Today. */
  minutes: number;
  sessions: number;
  /** 10 points per hour of focus (section 5), never more than the ranking will give. */
  points: number;
  /** Days in a row with at least 25 minutes. Today only adds: until then, yesterday's streak holds. */
  streak: number;
}

/**
 * `local` are the sessions kept on this device. They may already be on the server too, at any
 * moment: what is the same session (same start) counts once.
 */
export function summarizeFocus(
  history: FocusHistory | undefined,
  local: readonly FocusSession[],
  today: IsoDate,
): FocusSummary {
  const byStart = new Map<number, FocusSession>();
  for (const session of [...(history?.sessions ?? []), ...local]) byStart.set(session.startedAt, session);

  const since = recentSince(today);
  const minutes = new Map<IsoDate, number>();
  for (const { day, minutes: total } of history?.days ?? []) if (day < since) minutes.set(day, total);
  let sessions = 0;
  for (const session of byStart.values()) {
    const day = dayOfSession(session);
    // Older days are already added up by the server.
    if (day < since) continue;
    minutes.set(day, (minutes.get(day) ?? 0) + session.minutes);
    if (day === today) sessions++;
  }

  const counts = (day: IsoDate) => (minutes.get(day) ?? 0) >= STREAK_MIN;
  let streak = counts(today) ? 1 : 0;
  for (let day = addDays(today, -1); counts(day); day = addDays(day, -1)) streak++;

  const focused = minutes.get(today) ?? 0;
  return { minutes: focused, sessions, points: Math.floor(focused / 6), streak };
}

/** 0 → "0m", 105 → "1h 45m", 120 → "2h". */
export function formatFocused(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
