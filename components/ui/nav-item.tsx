import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

interface NavItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  /** Icon-only (72 px rail). The label stays as the accessible name and tooltip. */
  compact?: boolean;
  onNavigate?: () => void;
}

export function NavItem({ href, label, icon: Icon, active, compact = false, onNavigate }: NavItemProps) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      onClick={onNavigate}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-md text-sm no-underline transition-colors duration-150",
        compact ? "size-11 justify-center" : "px-3.5",
        active ? "bg-active font-semibold text-accent" : "font-medium text-fg-2 hover:bg-surface-alt hover:text-fg",
      )}
    >
      <Icon aria-hidden size={20} strokeWidth={1.75} className="shrink-0" />
      {!compact && <span>{label}</span>}
    </Link>
  );
}

interface TabBarItemProps {
  label: string;
  icon: LucideIcon;
  active: boolean;
  href?: string;
  /** For "Mais", which opens a sheet instead of navigating. */
  onClick?: () => void;
  expanded?: boolean;
}

const tabBarClasses =
  "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-md text-[11px] no-underline transition-colors duration-150";

export function TabBarItem({ label, icon: Icon, active, href, onClick, expanded }: TabBarItemProps) {
  const content = (
    <>
      <Icon aria-hidden size={24} strokeWidth={active ? 2 : 1.75} />
      <span>{label}</span>
    </>
  );
  const state = active ? "font-bold text-accent" : "font-medium text-fg-2";
  if (href) {
    return (
      <Link href={href} aria-current={active ? "page" : undefined} className={cn(tabBarClasses, state)}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-haspopup="dialog"
      className={cn(tabBarClasses, state)}
    >
      {content}
    </button>
  );
}
