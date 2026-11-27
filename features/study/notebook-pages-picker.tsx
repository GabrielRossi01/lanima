"use client";

import { Check, NotebookPen } from "lucide-react";
import type { NotebookDocument } from "@/features/notebook/documents";
import { cn } from "@/lib/cn";
import { formatDate, todayIn } from "@/lib/dates/calendar";

/**
 * Notebook pages as sources (section 7.5: "e, opcionalmente, páginas do caderno"): the ones sent
 * with "Usar no resumo", with a checkbox each, like files and summaries.
 */
export function NotebookPagesPicker({
  pages,
  selected,
  onToggle,
  label,
}: {
  pages: readonly NotebookDocument[];
  selected: ReadonlySet<string>;
  onToggle: (documentId: string) => void;
  label: string;
}) {
  return (
    <ul aria-label={label} className="m-0 list-none overflow-hidden rounded-card border border-line bg-surface p-0">
      {pages.map((page) => {
        const checked = page.ready && selected.has(page.id);
        return (
          <li key={page.id} className="border-t border-line first:border-t-0">
            <label
              className={cn(
                "relative flex min-h-16 items-center gap-3.5 px-3.5 py-2.5",
                page.ready ? "cursor-pointer" : "cursor-default",
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!page.ready}
                onChange={() => onToggle(page.id)}
                className="peer absolute inset-0 size-full cursor-pointer appearance-none opacity-0 disabled:cursor-default"
              />
              <span
                aria-hidden
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-[7px] border-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand",
                  checked ? "border-btn bg-btn text-white" : "border-checkbox",
                  !page.ready && "border-dashed",
                )}
              >
                {checked && <Check size={14} strokeWidth={3} />}
              </span>
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-alt text-accent max-md:hidden"
              >
                <NotebookPen size={20} strokeWidth={1.75} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-semibold">{page.name}</span>
                <span className="text-[12.5px] text-fg-2">
                  Caderno · lida em {formatDate(todayIn(new Date(page.updatedAt))).slice(0, 5)}
                </span>
              </span>
              {!page.ready && <span className="shrink-0 text-xs font-semibold text-warning-text">Lendo…</span>}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
