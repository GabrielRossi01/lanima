import { APP_TIME_ZONE } from "./greeting";

/**
 * Calendar days in America/Sao_Paulo as "YYYY-MM-DD" strings (the same format Postgres `date`
 * columns use). Arithmetic happens on those strings through UTC noon, so no device time zone or
 * daylight-saving change can shift a day.
 */
export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A day that exists: "2026-02-31" has the right shape, but Date would roll it into March. */
export function isIsoDate(value: string): value is IsoDate {
  if (!ISO_DATE.test(value)) return false;
  const date = toUtcNoon(value);
  return !Number.isNaN(date.getTime()) && fromUtc(date) === value;
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

/** "05/12/2026": how calendar days are written in the app. */
export function formatDate(day: IsoDate): string {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

/** "5 de dezembro de 2026" (for screen readers). */
export function spokenDate(day: IsoDate): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

/** "dezembro de 2026" */
export function monthTitle(day: IsoDate): string {
  const [y, m] = day.split("-").map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
}

/** Same day `n` months away, or the last day when that month is shorter (31 Jan → 28 Feb). */
export function addMonths(day: IsoDate, n: number): IsoDate {
  const [y, m, d] = day.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + n, 0, 12)).getUTCDate();
  return fromUtc(new Date(Date.UTC(y, m - 1 + n, Math.min(d, last), 12)));
}

/** Weeks (Monday–Sunday) that cover the month of `day`, with the days of the months around it. */
export function monthGrid(day: IsoDate): IsoDate[][] {
  const first = `${day.slice(0, 8)}01`;
  const last = addDays(addMonths(first, 1), -1);
  const weeks: IsoDate[][] = [];
  for (let start = weekOf(first).start; start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  return weeks;
}

/**
 * What the person typed, shaped as dd/mm/aaaa: slashes appear on their own, and typing them
 * ("5/12/") works too. Parts already typed stay in place while another one is being fixed.
 */
export function maskDate(raw: string): string {
  const sizes = [2, 2, 4];
  const parts = [""];
  for (const char of raw) {
    const i = parts.length - 1;
    if (char === "/") {
      if (i < 2 && (i > 0 || parts[0] !== "")) parts.push("");
    } else if (char >= "0" && char <= "9") {
      if (parts[i].length < sizes[i]) parts[i] += char;
      else if (i < 2) parts.push(char);
    }
  }
  return parts.join("/");
}

/** "05/12/2026" or "5/12/2026" → "2026-12-05"; null while incomplete or if the day doesn't exist. */
export function parseDate(text: string): IsoDate | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/.exec(text.trim());
  if (!match) return null;
  const iso = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}

/** "hoje", "amanhã", "em 6 dias", "ontem", "há 3 dias". */
export function relativeDays(from: IsoDate, to: IsoDate): string {
  const n = daysBetween(from, to);
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  if (n === -1) return "ontem";
  return n > 0 ? `em ${n} dias` : `há ${-n} dias`;
}
