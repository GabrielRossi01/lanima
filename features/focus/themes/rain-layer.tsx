"use client";

import { memo, useMemo } from "react";
import { rainDrops, ripples, windowDrops } from "@/lib/focus/particles";
import type { LayerProps } from "./registry";
import css from "./themes.module.css";

/** Chuva (FocoChuva.html): fog, falling drops, drops on the window, ripples, and a shade at the bottom. */
export const RainLayer = memo(function RainLayer({ reduced }: LayerProps) {
  const drops = useMemo(() => rainDrops(reduced), [reduced]);
  const glass = useMemo(() => windowDrops(reduced), [reduced]);
  const rings = useMemo(() => ripples(reduced), [reduced]);
  return (
    <>
      <div className={css.fog} />
      {drops.map((d, i) => (
        <span
          key={i}
          data-particle="drop"
          className={css.drop}
          style={{
            left: `${d.left}%`,
            height: d.height,
            opacity: d.alpha,
            animationDuration: `${d.duration}s`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
      {glass.map((d, i) => (
        <span
          key={i}
          data-particle="window-drop"
          className={css.windowDrop}
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: Math.round(d.size * 1.25),
            animationDuration: `${d.duration}s`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
      {rings.map((d, i) => (
        <span
          key={i}
          data-particle="ripple"
          className={css.ripple}
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            animationDuration: `${d.duration}s`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
      <div className={css.rainShade} />
    </>
  );
});
