"use client";

import { memo, useEffect, useState } from "react";
import type { SoundId } from "@/lib/focus/prefs";
import { FOCUS_THEMES, themeStyle } from "./themes/registry";

/** The background of the theme that leaves stays underneath while the new one fades in. */
export const CROSSFADE_MS = 600;

interface ThemeBackdropProps {
  sound: SoundId;
  animation: boolean;
}

/**
 * Background and decorative layer of the theme, behind everything. Memoized and fed only by the
 * theme: the clock never re-renders it.
 */
export const ThemeBackdrop = memo(function ThemeBackdrop({ sound, animation }: ThemeBackdropProps) {
  const [stack, setStack] = useState<readonly SoundId[]>([sound]);
  const top = stack[stack.length - 1];
  // Same theme again while it still leaves (quick taps): it comes back to the top.
  if (top !== sound) setStack([...stack.filter((id) => id !== sound), sound]);

  useEffect(() => {
    if (stack.length === 1) return;
    const id = setTimeout(() => setStack((s) => s.slice(-1)), CROSSFADE_MS);
    return () => clearTimeout(id);
  }, [stack]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {stack.map((id) => {
        const theme = FOCUS_THEMES[id];
        const Layer = theme.Layer;
        return (
          <div
            key={id}
            data-focus-backdrop={id}
            style={themeStyle(theme)}
            className="absolute inset-0 bg-(image:--focus-bg) opacity-100 transition-opacity duration-[600ms] starting:opacity-0"
          >
            {Layer && animation && (
              <div data-focus-layer={id} className="absolute inset-0 overflow-hidden">
                <Layer reduced={false} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
