"use client";

import { Check } from "lucide-react";
import { StatusBadge, KIND_ICONS } from "@/features/files/status-badge";
import type { StoredFile } from "@/features/files/queries";
import { useFileStatuses } from "@/features/files/use-file-statuses";
import { cn } from "@/lib/cn";
import { formatDate, todayIn } from "@/lib/dates/calendar";
import { KIND_LABELS } from "@/lib/files/files";

/** A file can be summarized or turned into questions once its text is read. */
export function isUsable(file: StoredFile): boolean {
  return file.document?.status === "pronto";
}

function pagesLabel(file: StoredFile): string | null {
  const n = file.document?.page_count;
  if (!n) return null;
  if (file.kind === "slides") return n === 1 ? "1 slide" : `${n} slides`;
  if (file.kind === "foto") return null;
  return n === 1 ? "1 página" : `${n} páginas`;
}

/** List of files with a checkbox each (the approved drawing of step 1). */
export function SourcePicker({
  files,
  selected,
  onToggle,
  label,
}: {
  files: readonly StoredFile[];
  selected: ReadonlySet<string>;
  onToggle: (fileId: string) => void;
  label: string;
}) {
  const statuses = useFileStatuses(files);
  return (
    <ul aria-label={label} className="m-0 list-none overflow-hidden rounded-card border border-line bg-surface p-0">
      {files.map((file) => {
        const usable = isUsable(file);
        const checked = usable && selected.has(file.id);
        const Icon = KIND_ICONS[file.kind];
        const meta = [
          KIND_LABELS[file.kind],
          pagesLabel(file),
          `enviado em ${formatDate(todayIn(new Date(file.created_at))).slice(0, 5)}`,
        ]
          .filter(Boolean)
          .join(" · ");
        const status = statuses.get(file.id);
        return (
          <li key={file.id} className="border-t border-line first:border-t-0">
            <label
              className={cn(
                "relative flex min-h-16 items-center gap-3.5 px-3.5 py-2.5",
                usable ? "cursor-pointer" : "cursor-default",
              )}
            >
              <input
                type="checkbox"
                className="peer absolute inset-0 size-full cursor-pointer appearance-none opacity-0 disabled:cursor-default"
                checked={checked}
                disabled={!usable}
                onChange={() => onToggle(file.id)}
              />
              <span
                aria-hidden
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-[7px] border-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand",
                  checked ? "border-btn bg-btn text-white" : "border-checkbox",
                  !usable && "border-dashed",
                )}
              >
                {checked && <Check size={14} strokeWidth={3} />}
              </span>
              <span
                aria-hidden
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-alt text-accent max-md:hidden",
                  !usable && "opacity-55",
                )}
              >
                <Icon size={20} strokeWidth={1.75} />
              </span>
              <span className={cn("flex min-w-0 flex-1 flex-col gap-0.5", !usable && "opacity-55")}>
                <span className="truncate text-[15px] font-semibold">{file.name}</span>
                <span className="text-xs text-fg-2">{meta}</span>
              </span>
              {!usable && status && <StatusBadge status={status} />}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
