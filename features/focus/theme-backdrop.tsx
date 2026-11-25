"use client";

import { memo, useEffect, useState } from "react";
import type { SoundId } from "@/lib/focus/prefs";
import { FpsMeter } from "./fps-meter";
import { FOCUS_THEMES, themeStyle } from "./themes/registry";
import css from "./themes/themes.module.css";
import { useHidden } from "./use-hidden";
import { useParticleQuality } from "./use-particle-quality";

/** The background of the theme that leaves stays underneath while the new one fades in. */
export const CROSSFADE_MS = 600;

interface ThemeBackdropProps {
  sound: SoundId;
  animation: boolean;
  showFps?: boolean;
}

/**
 * Background and decorative layer of the theme, behind everything. Memoized and fed only by the
 * theme: the clock never re-renders it.
 */
export const ThemeBackdrop = memo(function ThemeBackdrop({ sound, animation, showFps = false }: ThemeBackdropProps) {
  const [stack, setStack] = useState<readonly SoundId[]>([sound]);
  const hidden = useHidden();
  const reduced = useParticleQuality(sound, animation && FOCUS_THEMES[sound].Layer !== null);
  const top = stack[stack.length - 1];
  // Same theme again while it still leaves (quick taps): it comes back to the top.
  if (top !== sound) setStack([...stack.filter((id) => id !== sound), sound]);

  useEffect(() => {
    if (stack.length === 1) return;
    const id = setTimeout(() => setStack((s) => s.slice(-1)), CROSSFADE_MS);
    return () => clearTimeout(id);
  }, [stack]);

  return (
    <>
      {/* Absolute, not fixed: on a phone the screen scrolls, and the moon must not slide under the clock. */}
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
                <div
                  data-focus-layer={id}
                  data-particles={reduced ? "half" : "full"}
                  data-paused={hidden ? "" : undefined}
                  className={css.layer}
                >
                  <Layer reduced={reduced} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {showFps && <FpsMeter reduced={reduced} />}
    </>
  );
});
