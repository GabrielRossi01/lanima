import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { SUBJECT_BG, type SubjectColor } from "@/lib/subjects/colors";

interface IconTileProps {
  icon: LucideIcon;
  /** `brand` is the cement-blue tile used by the logo and metric "Foco hoje". */
  color?: SubjectColor | "brand";
  size?: 36 | 40 | 48 | 64;
  className?: string;
}

const iconSize = { 36: 18, 40: 20, 48: 24, 64: 30 } as const;
const tileSize = { 36: "size-9", 40: "size-10", 48: "size-12", 64: "size-16" } as const;

export function IconTile({ icon: Icon, color = "brand", size = 40, className }: IconTileProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md",
        tileSize[size],
        color === "brand" ? "bg-active text-accent" : cn(SUBJECT_BG[color], "text-ink"),
        className,
      )}
    >
      <Icon size={iconSize[size]} strokeWidth={1.75} />
    </div>
  );
}
