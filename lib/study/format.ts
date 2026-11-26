import { addDays, todayIn, type IsoDate } from "@/lib/dates/calendar";

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "hoje", "ontem", "18 nov": when a summary or a test was made (São Paulo days). */
export function shortDay(timestamp: string, today: IsoDate): string {
  const day = todayIn(new Date(timestamp));
  if (day === today) return "hoje";
  if (day === addDays(today, -1)) return "ontem";
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The footer of every summary and test made by the AI (section 7.5). */
export const AI_DISCLAIMER = "Gerado por IA a partir dos seus arquivos. Confira com o material da aula.";
