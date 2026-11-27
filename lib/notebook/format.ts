import { daysBetween, todayIn } from "@/lib/dates/calendar";

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "agora", "há 12 min", "há 3 h", "ontem", "há 4 dias", "18 nov": when a page was last changed. */
export function editedWhen(editedAt: number, now: number): string {
  const minutes = Math.floor((now - editedAt) / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const days = daysBetween(todayIn(new Date(editedAt)), todayIn(new Date(now)));
  if (days <= 0) return `há ${Math.floor(minutes / 60)} h`;
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  const [, m, d] = todayIn(new Date(editedAt)).split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

export function pagesLabel(n: number): string {
  return `${n} ${n === 1 ? "página" : "páginas"}`;
}
