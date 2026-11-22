import { UserRound } from "lucide-react";
import { cn } from "@/lib/cn";
import { SUBJECT_BG, type SubjectColor } from "@/lib/subjects/colors";

interface AvatarProps {
  name?: string;
  /** Signed URL for the photo; falls back to initials, then to an icon. */
  src?: string | null;
  size?: 32 | 40 | 48 | 64 | 96;
  color?: SubjectColor | "brand";
  ring?: boolean;
  className?: string;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const sizes = {
  32: "size-8 text-[11px]",
  40: "size-10 text-sm",
  48: "size-12 text-base",
  64: "size-16 text-xl",
  96: "size-24 text-3xl",
} as const;

export function Avatar({ name, src, size = 40, color = "brand", ring = false, className }: AvatarProps) {
  const initials = name ? initialsOf(name) : "";
  const label = name ?? "Perfil";
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold",
        sizes[size],
        color === "brand" ? "bg-active text-accent" : cn(SUBJECT_BG[color], "text-ink"),
        ring && "ring-2 ring-surface",
        className,
      )}
    >
      {src ? (
        // Signed Supabase URLs change per request, so next/image caching does not help here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : initials ? (
        <span aria-hidden>{initials}</span>
      ) : (
        <UserRound aria-hidden size={Math.round(size / 2)} strokeWidth={1.75} />
      )}
    </div>
  );
}
