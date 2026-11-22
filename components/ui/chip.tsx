import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { SUBJECT_BG, type SubjectColor } from "@/lib/subjects/colors";

interface SubjectChipProps extends ComponentProps<"span"> {
  color: SubjectColor | "neutro";
  size?: "m" | "s";
}

/** Subject chip: pastel background with always-dark `--ink` text, in both themes. */
export function SubjectChip({ color, size = "m", className, ...props }: SubjectChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full font-medium",
        color === "neutro" ? "text-fg-2" : "text-ink",
        size === "m" ? "h-8 px-3.5 text-xs" : "h-6 px-2.5 text-xs",
        SUBJECT_BG[color],
        className,
      )}
      {...props}
    />
  );
}

interface FilterChipProps extends Omit<ComponentProps<"button">, "type"> {
  selected: boolean;
  count?: number;
}

/** Toggle chip used for filters ("Todas 6", "Com prova próxima 3"). */
export function FilterChip({ selected, count, className, children, ...props }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors duration-150",
        selected ? "border-fg bg-fg text-bg" : "border-line-strong bg-surface text-fg hover:bg-surface-alt",
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && <span className="opacity-70">{count}</span>}
    </button>
  );
}
