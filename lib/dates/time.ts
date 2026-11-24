/** Times of day as "HH:MM", 24 hours (what the database columns and forms keep). */

/**
 * What the person typed, shaped as hh:mm: "1430" → "14:30" and "830" → "8:30" (no hour starts with
 * 3 to 9 and has two digits). Typing the colon (or "h", as in "8h30") works too.
 */
export function maskTime(raw: string): string {
  const text = raw.replace(/h/gi, ":");
  const digits = (s: string) => s.replace(/\D/g, "");
  const colon = text.indexOf(":");
  if (colon >= 0) {
    const hour = digits(text.slice(0, colon)).slice(0, 2);
    return hour ? `${hour}:${digits(text.slice(colon + 1)).slice(0, 2)}` : digits(text).slice(0, 2);
  }
  const all = digits(text);
  const size = all[0] >= "3" ? 1 : 2;
  return all.length > size ? `${all.slice(0, size)}:${all.slice(size, size + 2)}` : all;
}

/** "08:30" or "8:30" → "08:30"; null while incomplete or when the time doesn't exist. */
export function parseTime(text: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

/** Like parseTime, and a lone hour counts as the hour sharp ("14" or "14:" → "14:00"). */
export function completeTime(text: string): string | null {
  const hour = /^(\d{1,2}):?$/.exec(text.trim());
  return parseTime(hour ? `${hour[1]}:00` : text);
}
