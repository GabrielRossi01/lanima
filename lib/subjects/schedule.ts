import { z } from "zod";
import { APP_TIME_ZONE } from "@/lib/dates/greeting";
import { WEEKDAY_SHORT } from "@/lib/dates/calendar";

/** One weekly class. day: ISO weekday (1 = Monday … 7 = Sunday); start: "HH:MM". */
export const scheduleSlotSchema = z.object({
  day: z.number().int().min(1).max(7),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Use o formato 08:00." }),
  lab: z.boolean(),
  room: z.string().trim().max(40).optional(),
});

export type ScheduleSlot = z.infer<typeof scheduleSlotSchema>;

export const scheduleSchema = z.array(scheduleSlotSchema).max(14, { error: "No máximo 14 aulas por semana." });

/** Reads slots from the database (jsonb), dropping anything malformed instead of crashing. */
export function parseSlots(value: unknown): ScheduleSlot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = scheduleSlotSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function sortSlots(slots: readonly ScheduleSlot[]): ScheduleSlot[] {
  return [...slots].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
}

/** "08:00" → "08h00" (the mockups' style). */
export function formatTime(start: string): string {
  return start.replace(":", "h");
}

/** "08:00" → "08h", "14:30" → "14h30" (compact, for the week agenda). */
export function formatTimeShort(start: string): string {
  const [h, m] = start.split(":");
  return m === "00" ? `${h}h` : `${h}h${m}`;
}

function joinDays(days: string[]): string {
  if (days.length <= 1) return days.join("");
  return `${days.slice(0, -1).join(", ")} e ${days.at(-1)}`;
}

/**
 * "Seg e Qua · 08h00", "Seg · 14h00 · lab", "Seg 08h00 · Qua 10h00".
 * Classes at the same time are grouped; "· lab" when every class is a lab.
 */
export function formatSchedule(slots: readonly ScheduleSlot[]): string {
  const sorted = sortSlots(slots);
  if (sorted.length === 0) return "";
  const times = new Set(sorted.map((s) => s.start));
  const allLab = sorted.every((s) => s.lab);
  let text: string;
  if (times.size === 1) {
    text = `${joinDays(sorted.map((s) => WEEKDAY_SHORT[s.day - 1]))} · ${formatTime(sorted[0].start)}`;
  } else {
    text = sorted
      .map((s) => `${WEEKDAY_SHORT[s.day - 1]} ${formatTime(s.start)}${s.lab && !allLab ? " (lab)" : ""}`)
      .join(" · ");
  }
  return allLab ? `${text} · lab` : text;
}

export function rooms(slots: readonly ScheduleSlot[]): string[] {
  return [...new Set(slots.map((s) => s.room?.trim()).filter((r): r is string => Boolean(r)))];
}

export function hasLab(slots: readonly ScheduleSlot[]): boolean {
  return slots.some((s) => s.lab);
}

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const WEEKDAY_INDEX: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Minutes from the start of the week (Monday 00:00) in São Paulo, for `now`. */
export function minuteOfWeek(now: Date): number {
  const parts = Object.fromEntries(clockFormatter.formatToParts(now).map((p) => [p.type, p.value]));
  return (WEEKDAY_INDEX[parts.weekday] - 1) * 1440 + Number(parts.hour) * 60 + Number(parts.minute);
}

function slotMinute(slot: ScheduleSlot): number {
  const [h, m] = slot.start.split(":").map(Number);
  return (slot.day - 1) * 1440 + h * 60 + m;
}

/**
 * Minutes until the next class starts (a class that started less than `ongoingMin` ago still
 * counts as "next", so it doesn't jump to next week mid-class). `Infinity` without classes.
 */
export function minutesToNextClass(slots: readonly ScheduleSlot[], now: Date, ongoingMin = 90): number {
  if (slots.length === 0) return Number.POSITIVE_INFINITY;
  const current = minuteOfWeek(now);
  const week = 7 * 1440;
  return Math.min(
    ...slots.map((slot) => {
      let delta = slotMinute(slot) - current;
      if (delta < -ongoingMin) delta += week;
      return delta;
    }),
  );
}
