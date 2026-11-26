import { daysBetween, todayIn, type IsoDate } from "@/lib/dates/calendar";

/**
 * What the badge of a file says (section 7.9): its upload and the reading of its text. Pure, from
 * the saved rows plus what this tab is doing.
 */
export type FileStatus =
  | { kind: "enviando" }
  | { kind: "envio-interrompido" }
  | { kind: "na-fila" }
  | { kind: "lendo"; label?: string; fraction?: number }
  | { kind: "pronto" }
  | { kind: "sem-texto" }
  | { kind: "erro"; message?: string }
  | { kind: "interrompida" };

/** After this long without news, an upload or a reading from any device is taken as stopped. */
export const STALE_MS = 10 * 60_000;

export interface StatusInput {
  uploadedAt: string | null;
  createdAt: string;
  document: { status: string; updated_at: string } | null;
  /** Present when this tab is reading it: the progress, or null while it waits its turn. */
  local?: { label: string; fraction?: number } | null;
  /** Why the last reading on this device failed. */
  failure?: string;
  now: number;
}

export function fileStatus({ uploadedAt, createdAt, document, local, failure, now }: StatusInput): FileStatus {
  if (uploadedAt === null) {
    return now - Date.parse(createdAt) < STALE_MS ? { kind: "enviando" } : { kind: "envio-interrompido" };
  }
  if (local !== undefined) return local === null ? { kind: "na-fila" } : { kind: "lendo", ...local };
  switch (document?.status) {
    case "pronto":
      return { kind: "pronto" };
    case "sem_texto":
      return { kind: "sem-texto" };
    case "erro":
      return { kind: "erro", message: failure };
    case "extraindo":
      // Maybe another device is reading it right now.
      return now - Date.parse(document.updated_at) < STALE_MS ? { kind: "lendo" } : { kind: "interrompida" };
    default:
      return { kind: "interrompida" };
  }
}

export const STATUS_LABELS: Record<FileStatus["kind"], string> = {
  enviando: "Enviando…",
  "envio-interrompido": "Envio interrompido",
  "na-fila": "Na fila para leitura",
  lendo: "Lendo…",
  pronto: "Pronto para resumir",
  "sem-texto": "Sem texto legível",
  erro: "Não foi possível ler",
  interrompida: "Leitura interrompida",
};

/** Whether "Ler de novo" makes sense. */
export function canReadAgain(status: FileStatus): boolean {
  return status.kind === "erro" || status.kind === "interrompida" || status.kind === "sem-texto";
}

/** Whether the text can be previewed. */
export function hasPreview(status: FileStatus): boolean {
  return status.kind === "pronto" || status.kind === "sem-texto";
}

const SHORT_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "Hoje", "Ontem", "19 nov", "19 nov 2025": when a file was sent, in São Paulo days. */
export function dayLabel(at: string, today: IsoDate): string {
  const day = todayIn(new Date(at));
  const ago = daysBetween(day, today);
  if (ago === 0) return "Hoje";
  if (ago === 1) return "Ontem";
  const [y, m, d] = day.split("-").map(Number);
  const short = `${d} ${SHORT_MONTHS[m - 1]}`;
  return y === Number(today.slice(0, 4)) ? short : `${short} ${y}`;
}
