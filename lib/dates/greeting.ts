/** Time zone for points, streaks and weeks (section 5). Greetings use the device zone. */
export const APP_TIME_ZONE = "America/Sao_Paulo";

function hourIn(date: Date, timeZone?: string): number {
  const hour = new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone }).format(date);
  return Number(hour);
}

/** "Bom dia" (5–11h), "Boa tarde" (12–17h), "Boa noite" (18–4h). Defaults to the device time zone. */
export function greetingFor(date: Date, timeZone?: string): string {
  const h = hourIn(date, timeZone);
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

/** "Sábado, 21 de novembro" */
export function longDate(date: Date, timeZone?: string): string {
  const text = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  }).format(date);
  // "sábado, 21 de novembro" → capitalize the weekday only.
  return text.charAt(0).toUpperCase() + text.slice(1);
}
