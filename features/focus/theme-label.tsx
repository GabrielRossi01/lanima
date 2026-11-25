"use client";

import { useAudioState } from "./audio-state";
import { FOCUS_THEMES } from "./themes/registry";
import css from "./themes/themes.module.css";
import { useHidden } from "./use-hidden";
import type { SoundId } from "@/lib/focus/prefs";

/** Seconds of each bar (FocoLofi.html). */
const BARS = [0.7, 0.88, 1.06, 1.24, 0.7, 0.88];

/** Name of the theme at the top. "Tocando agora" and the moving equalizer only while it really plays. */
export function ThemeLabel({ sound, animation }: { sound: SoundId; animation: boolean }) {
  const playing = useAudioState((s) => s.playing);
  const hidden = useHidden();
  const theme = FOCUS_THEMES[sound];
  if (!theme.topLabel) return null;
  return (
    <>
      {playing ? (theme.playingLabel ?? theme.topLabel) : theme.topLabel}
      {sound === "lofi" && (
        <span
          aria-hidden
          data-equalizer
          data-playing={playing && animation ? "" : undefined}
          data-paused={hidden ? "" : undefined}
          className={css.equalizer}
        >
          {BARS.map((seconds, i) => (
            <span key={i} style={{ animationDuration: `${seconds}s`, animationDelay: `${-i * 0.13}s` }} />
          ))}
        </span>
      )}
    </>
  );
}
