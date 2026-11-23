"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useAvatarUrl, useProfile } from "@/features/profile/queries";
import { cn } from "@/lib/cn";
import { profileSubtitle } from "@/lib/profile/profile";

interface ProfileCardProps {
  compact?: boolean;
  onNavigate?: () => void;
  active?: boolean;
}

/** Sidebar footer card with her name, photo, course and semester. */
export function ProfileCard({ compact = false, onNavigate, active = false }: ProfileCardProps) {
  const { data: profile } = useProfile();
  const avatarUrl = useAvatarUrl(profile?.avatar_path).data;
  const name = profile?.name || undefined;

  if (compact) {
    return (
      <Link
        href="/perfil"
        aria-label="Perfil e configurações"
        aria-current={active ? "page" : undefined}
        title="Perfil e configurações"
        onClick={onNavigate}
        className="flex size-11 items-center justify-center rounded-full"
      >
        <Avatar size={40} name={name} src={avatarUrl} />
      </Link>
    );
  }
  return (
    <Link
      href="/perfil"
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-[14px] p-3 no-underline transition-colors duration-150",
        active ? "bg-active" : "bg-surface-alt hover:bg-active",
      )}
    >
      <Avatar size={40} name={name} src={avatarUrl} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-fg">{name ?? "Seu perfil"}</span>
        <span className="truncate text-xs text-fg-2">{profile ? profileSubtitle(profile) : "Biomedicina"}</span>
      </span>
      <Settings aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-fg-2" />
    </Link>
  );
}
