import { FileText, ImageIcon, LoaderCircle, Presentation, FileType, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { FileKind } from "@/lib/files/files";
import { STATUS_LABELS, type FileStatus } from "@/lib/files/status";

export const KIND_ICONS: Record<FileKind, LucideIcon> = {
  pdf: FileText,
  foto: ImageIcon,
  documento: FileType,
  slides: Presentation,
};

const TONES: Record<FileStatus["kind"], string> = {
  enviando: "bg-subtle text-fg-2",
  "na-fila": "bg-subtle text-fg-2",
  lendo: "bg-subtle text-fg-2",
  pronto: "bg-hl-green text-ink",
  "sem-texto": "bg-hl-yellow text-ink",
  interrompida: "bg-hl-yellow text-ink",
  "envio-interrompido": "bg-hl-yellow text-ink",
  erro: "bg-hl-pink text-ink",
};

const BUSY = new Set<FileStatus["kind"]>(["enviando", "na-fila", "lendo"]);

/** "Lendo…", "Pronto para resumir", "Sem texto legível"… (section 7.9). */
export function StatusBadge({ status, className }: { status: FileStatus; className?: string }) {
  const busy = BUSY.has(status.kind);
  return (
    <span
      data-status={status.kind}
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full px-2.5 text-xs font-semibold",
        TONES[status.kind],
        className,
      )}
    >
      {busy && (
        <LoaderCircle aria-hidden size={13} strokeWidth={2} className="animate-spin motion-reduce:animate-none" />
      )}
      {STATUS_LABELS[status.kind]}
    </span>
  );
}

/** Line under the badge: the reading's progress or why it failed. */
export function statusDetail(status: FileStatus): string | null {
  if (status.kind === "lendo") {
    if (!status.label) return null;
    return status.fraction !== undefined && status.label.startsWith("Lendo a foto")
      ? `${status.label} ${Math.round(status.fraction * 100)}%`
      : status.label;
  }
  if (status.kind === "erro") return status.message ?? null;
  if (status.kind === "interrompida") return "O app foi fechado durante a leitura.";
  if (status.kind === "envio-interrompido") return "O envio não terminou. Exclua e envie de novo.";
  if (status.kind === "sem-texto") return "Não há texto que dê para ler neste arquivo.";
  return null;
}
