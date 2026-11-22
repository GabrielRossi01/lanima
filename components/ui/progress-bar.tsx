import { cn } from "@/lib/cn";

interface ProgressBarProps {
  /** 0–100 */
  value: number;
  label: string;
  showValue?: boolean;
  tone?: "brand" | "success" | "warning" | "danger";
  className?: string;
}

const tones = {
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
} as const;

export function ProgressBar({ value, label, showValue = false, tone = "brand", className }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-250", tones[tone])}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showValue && <span className="text-xs font-semibold text-accent tabular-nums">{clamped}%</span>}
    </div>
  );
}
