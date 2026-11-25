"use client";

import { memo, useMemo } from "react";
import { stars } from "@/lib/focus/particles";
import { syncBreath } from "../sync-breath";
import { useHidden } from "../use-hidden";
import type { LayerProps } from "./registry";
import css from "./themes.module.css";

/** Deep Focus (FocoDeep.html): breathing glow and sonar rings around the clock, drifting lights, vignette. */
export const DeepLayer = memo(function DeepLayer({ reduced }: LayerProps) {
  const lights = useMemo(() => stars(reduced), [reduced]);
  // Coming back to the tab remounts it, in phase again after the pause.
  const hidden = useHidden();
  return (
    <>
      <div key={hidden ? "hidden" : "visible"} ref={syncBreath} data-breath className={css.glow} />
      {[0, -3, -6].map((delay) => (
        <div key={delay} data-sonar className={css.sonar} style={{ animationDelay: `${delay}s` }} />
      ))}
      {lights.map((d, i) => (
        <span
          key={i}
          data-particle="star"
          className={css.star}
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            opacity: d.alpha,
            animationDuration: `${d.duration}s`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
      <div className={css.vignette} />
    </>
  );
});
