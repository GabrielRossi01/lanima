import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "inverse";
export type ButtonSize = "m" | "s";

const base =
  "inline-flex max-w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border font-semibold no-underline transition-colors duration-150 disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "border-btn bg-btn text-white hover:brightness-110",
  secondary: "border-line-strong bg-surface text-accent hover:bg-surface-alt",
  ghost: "border-transparent bg-transparent text-accent hover:bg-surface-alt",
  /** White pill on dark cards ("Próxima prova", focus mode). */
  inverse: "border-white bg-white text-night-900 hover:brightness-95",
};

const sizes: Record<ButtonSize, string> = {
  m: "h-11 px-5 text-sm",
  s: "h-10 px-4 text-sm",
};

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconPosition?: "start" | "end";
  children: ReactNode;
}

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "m", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

function Content({
  icon: Icon,
  iconPosition = "start",
  children,
}: Pick<CommonProps, "icon" | "iconPosition" | "children">) {
  const glyph = Icon ? <Icon aria-hidden size={18} strokeWidth={1.75} className="shrink-0" /> : null;
  return (
    <>
      {iconPosition === "start" && glyph}
      <span className="min-w-0 truncate">{children}</span>
      {iconPosition === "end" && glyph}
    </>
  );
}

export function Button({
  variant,
  size,
  icon,
  iconPosition,
  className,
  children,
  type = "button",
  ...props
}: CommonProps & Omit<ComponentProps<"button">, "children">) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} {...props}>
      <Content icon={icon} iconPosition={iconPosition}>
        {children}
      </Content>
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  icon,
  iconPosition,
  className,
  children,
  ...props
}: CommonProps & Omit<ComponentProps<typeof Link>, "children">) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...props}>
      <Content icon={icon} iconPosition={iconPosition}>
        {children}
      </Content>
    </Link>
  );
}
