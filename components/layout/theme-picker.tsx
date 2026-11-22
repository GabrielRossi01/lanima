"use client";

import { SegmentedControl } from "@/components/ui/segmented-control";
import type { ThemePreference } from "@/lib/theme/theme";
import { useTheme } from "@/lib/theme/use-theme";

const OPTIONS = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "system", label: "Automático" },
] as const satisfies readonly { value: ThemePreference; label: string }[];

export function ThemePicker({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
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
