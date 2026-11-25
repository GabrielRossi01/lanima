"use client";

import { syncBreath } from "./sync-breath";
import css from "./themes/themes.module.css";
import { useHidden } from "./use-hidden";

/** "Inspire" and "Expire" inside the ring, in phase with the glow. Decoration: not read aloud. */
export function BreathText() {
  const hidden = useHidden();
  return (
    <div
      key={hidden ? "hidden" : "visible"}
      aria-hidden
      data-breath-text
      data-paused={hidden ? "" : undefined}
      className={css.breath}
    >
      <span ref={syncBreath} className={css.inhale}>
        Inspire
      </span>
      <span ref={syncBreath} className={css.exhale}>
        Expire
      </span>
    </div>
  );
}
