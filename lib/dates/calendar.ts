import { APP_TIME_ZONE } from "./greeting";

/**
 * Calendar days in America/Sao_Paulo as "YYYY-MM-DD" strings (the same format Postgres `date`
 * columns use). Arithmetic happens on those strings through UTC noon, so no device time zone or
 * daylight-saving change can shift a day.
 */
export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): value is IsoDate {
  return ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
}

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in São Paulo for the given instant. */
export function todayIn(now: Date): IsoDate {
  return partsFormatter.format(now);
}

function toUtcNoon(day: IsoDate): Date {
  return new Date(`${day}T12:00:00Z`);
}

function fromUtc(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: IsoDate, days: number): IsoDate {
  const d = toUtcNoon(day);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcNoon(to).getTime() - toUtcNoon(from).getTime()) / 86_400_000);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function weekdayOf(day: IsoDate): number {
  const d = toUtcNoon(day).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Monday-to-Sunday week that contains `day` (section 5: weeks start on Monday). */
export function weekOf(day: IsoDate): { start: IsoDate; end: IsoDate } {
  const start = addDays(day, 1 - weekdayOf(day));
  return { start, end: addDays(start, 6) };
}

export const WEEKDAY_SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;
export const WEEKDAY_LONG = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"] as const;

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "5 de dezembro" */
export function dayMonth(day: IsoDate): string {
  const [, m, d] = day.split("-").map(Number);
  return `${d} de ${MONTHS[m - 1]}`;
}

/** "5 dez" */
export function dayMonthShort(day: IsoDate): string {
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

/** "hoje", "amanhã", "em 6 dias", "ontem", "há 3 dias". */
export function relativeDays(from: IsoDate, to: IsoDate): string {
  const n = daysBetween(from, to);
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  if (n === -1) return "ontem";
  return n > 0 ? `em ${n} dias` : `há ${-n} dias`;
}
