import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type CardTone = "surface" | "alt" | "deep";

const tones: Record<CardTone, string> = {
  surface: "border border-line bg-surface shadow-card",
  alt: "border border-transparent bg-surface-alt",
  deep: "border border-transparent bg-deep text-white",
};

interface CardProps extends ComponentProps<"section"> {
  tone?: CardTone;
  /** 18 (compact) or 20 px padding (default). */
  padding?: "compact" | "default" | "none";
}

export function Card({ tone = "surface", padding = "default", className, ...props }: CardProps) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-card",
        tones[tone],
        padding === "default" && "gap-3 p-5",
        padding === "compact" && "gap-3 p-[18px]",
        className,
      )}
      {...props}
    />
  );
}

interface CardHeaderProps {
  title: ReactNode;
  action?: ReactNode;
  as?: "h2" | "h3";
}

export function CardHeader({ title, action, as: Heading = "h2" }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Heading className="type-h2 m-0 min-w-0 wrap-break-word">{title}</Heading>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
