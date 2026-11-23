"use client";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { useSyncedTheme } from "@/features/profile/theme-sync";
import type { ThemePreference } from "@/lib/theme/theme";

const OPTIONS = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "system", label: "Automático" },
] as const satisfies readonly { value: ThemePreference; label: string }[];

export function ThemePicker({ className }: { className?: string }) {
  const { preference, setPreference } = useSyncedTheme();
  return (
    <SegmentedControl
      label="Tema"
      options={OPTIONS}
      value={preference}
      onChange={setPreference}
      className={className}
    />
  );
}
