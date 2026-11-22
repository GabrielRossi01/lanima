import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { SubjectColor } from "@/lib/subjects/colors";
import { Card } from "./card";
import { IconTile } from "./icon-tile";

interface MetricCardProps {
  icon: LucideIcon;
  color?: SubjectColor | "brand";
  value: ReactNode;
  label: ReactNode;
  className?: string;
}

/** Tile with icon, a Fraunces value and a label ("1h 45m · Foco hoje · meta 2h"). */
export function MetricCard({ icon, color = "brand", value, label, className }: MetricCardProps) {
  return (
    <Card padding="compact" className={cn("min-w-0 flex-1", className)}>
      <IconTile icon={icon} color={color} size={36} />
      <div className="flex flex-col gap-0.5">
        <span className="type-metric">{value}</span>
        <span className="text-[13px] text-fg-2">{label}</span>
      </div>
    </Card>
  );
}
