import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IconTile } from "./icon-tile";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line-strong px-6 py-10 text-center",
        className,
      )}
    >
      <IconTile icon={icon} size={48} />
      <div className="flex min-w-0 max-w-sm flex-col gap-1 wrap-break-word">
        <h2 className="type-h2 m-0">{title}</h2>
        {description && <p className="type-body m-0 text-fg-2">{description}</p>}
      </div>
      {action && <div className="mt-1 max-w-full">{action}</div>}
    </div>
  );
}
