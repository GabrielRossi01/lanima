import { cn } from "@/lib/cn";

export type Difficulty = "facil" | "medio" | "dificil";

const config: Record<Difficulty, { label: string; bg: string; bars: number }> = {
  facil: { label: "Fácil", bg: "bg-hl-green", bars: 1 },
  medio: { label: "Médio", bg: "bg-hl-yellow", bars: 2 },
  dificil: { label: "Difícil", bg: "bg-hl-pink", bars: 3 },
};

const barHeights = ["h-1.5", "h-[9px]", "h-3"] as const;

export function DifficultyBadge({ level, className }: { level: Difficulty; className?: string }) {
  const { label, bg, bars } = config[level];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold text-ink",
        bg,
        className,
      )}
    >
      <span aria-hidden className="inline-flex items-end gap-0.5">
        {barHeights.map((h, i) => (
          <span key={h} className={cn("w-1 rounded-[2px]", h, i < bars ? "bg-ink" : "bg-ink/25")} />
        ))}
      </span>
      {label}
    </span>
  );
}

/** Neutral pill for the question type ("Caso clínico"). */
export function TypeBadge({ children, className }: { children: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center whitespace-nowrap rounded-full bg-subtle px-2.5 text-xs font-medium text-fg-2",
        className,
      )}
    >
      {children}
    </span>
  );
}
