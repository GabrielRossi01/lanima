import { z } from "zod";
import { addDays, daysBetween, formatDate, isIsoDate, weekOf, type IsoDate } from "@/lib/dates/calendar";
import type { Database } from "@/lib/supabase/database.types";

export type GoalRow = Database["public"]["Tables"]["goals"]["Row"];

/** Overdue goals older than this stop showing in "Metas de hoje". */
export const OVERDUE_WINDOW_DAYS = 14;

export const goalFormSchema = z.object({
  title: z.string().trim().min(1, { error: "Escreva a meta." }).max(120, { error: "Use até 120 caracteres." }),
  subject_id: z.uuid().nullable(),
  date: z.string().refine(isIsoDate, { error: "Escolha o dia." }),
  duration_min: z.number().int().min(5).max(600).nullable(),
  time_of_day: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Use o formato 16:00." })
    .nullable(),
});
export type GoalForm = z.infer<typeof goalFormSchema>;

export const DURATION_PRESETS: readonly number[] = [15, 30, 45, 60, 90];

/** The presets, plus the goal's own duration when it is another one, so editing doesn't lose it. */
export function durationOptions(current?: number | null): number[] {
  return [...new Set([...DURATION_PRESETS, ...(current ? [current] : [])])].sort((a, b) => a - b);
}

/** "30 min", "1h", "1h30". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** "16h", "16h30" for a fixed time; otherwise the duration; otherwise nothing. */
export function goalWhen(goal: Pick<GoalRow, "duration_min" | "time_of_day">): string {
  if (goal.time_of_day) {
    const [h, m] = goal.time_of_day.split(":");
    return m === "00" ? `${h}h` : `${h}h${m}`;
  }
  return goal.duration_min ? formatDuration(goal.duration_min) : "";
}

export function isDone(goal: Pick<GoalRow, "completed_at">): boolean {
  return goal.completed_at !== null;
}

/** Range of goals the app loads: overdue window up to the end of this week. */
export function goalsRange(today: IsoDate): { from: IsoDate; to: IsoDate } {
  return { from: addDays(today, -OVERDUE_WINDOW_DAYS), to: weekOf(today).end };
}

function byTime(a: GoalRow, b: GoalRow) {
  return (a.time_of_day ?? "99").localeCompare(b.time_of_day ?? "99") || a.created_at.localeCompare(b.created_at);
}

/**
 * "Metas de hoje": unfinished goals from earlier days first (oldest first), then today's goals
 * (fixed times in order, then the rest by creation).
 */
export function todayList(goals: readonly GoalRow[], today: IsoDate): { overdue: GoalRow[]; today: GoalRow[] } {
  const overdue = goals
    .filter((g) => !isDone(g) && daysBetween(g.date, today) > 0 && daysBetween(g.date, today) <= OVERDUE_WINDOW_DAYS)
    .sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b));
  const todays = goals.filter((g) => g.date === today).sort(byTime);
  return { overdue, today: todays };
}

/** "de ontem", "de 20/11/2026". */
export function overdueLabel(goal: Pick<GoalRow, "date">, today: IsoDate): string {
  return daysBetween(goal.date, today) === 1 ? "de ontem" : `de ${formatDate(goal.date)}`;
}

/** "Metas da semana": goals dated in this Monday–Sunday week, done vs. total. */
export function weekProgress(goals: readonly GoalRow[], today: IsoDate): { done: number; total: number } {
  const { start, end } = weekOf(today);
  const week = goals.filter((g) => g.date >= start && g.date <= end);
  return { done: week.filter(isDone).length, total: week.length };
}
