import { cn } from "@/lib/cn";

/** The Lanima DNA mark, as drawn in the approved mockups (lucide-style, 1.75 stroke). */
export function LogoMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 3c0 6 14 12 14 18M19 3c0 6-14 12-14 18M8 6h8M8 18h8M10 12h4" />
    </svg>
  );
}

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-active text-accent">
        <LogoMark />
      </span>
      <span className={cn("font-serif text-[22px] font-semibold tracking-[-0.5px] text-fg", compact && "sr-only")}>
        Lanima
      </span>
    </span>
  );
}
