import type { LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type IconButtonVariant = "outline" | "ghost" | "primary" | "on-dark";

const variants: Record<IconButtonVariant, string> = {
  outline: "border border-line bg-surface text-fg hover:bg-surface-alt",
  ghost: "border border-transparent bg-transparent text-fg-2 hover:bg-surface-alt hover:text-fg",
  primary: "border border-btn bg-btn text-white hover:brightness-110",
  "on-dark": "border border-white/15 bg-white/10 text-white hover:bg-white/20",
};

interface IconButtonProps extends Omit<ComponentProps<"button">, "children"> {
  icon: LucideIcon;
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  variant?: IconButtonVariant;
  /** 44 (default) or 40 px. Never smaller: minimum touch target. */
  size?: "m" | "s";
}

export function IconButton({
  icon: Icon,
  label,
  variant = "outline",
  size = "m",
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full p-0 transition-colors duration-150 disabled:opacity-50",
        size === "m" ? "size-11" : "size-10",
        variants[variant],
        className,
      )}
      {...props}
    >
      <Icon aria-hidden size={20} strokeWidth={1.75} />
    </button>
  );
}
