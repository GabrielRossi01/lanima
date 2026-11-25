"use client";

import { memo, useMemo } from "react";
import { BUILDINGS, dustMotes, litWindows, SKYLINE_WIDTH } from "@/lib/focus/particles";
import type { LayerProps } from "./registry";
import css from "./themes.module.css";

const GROOVES = Array.from({ length: 11 }, (_, i) => 60 + i * 8);
const percent = (px: number) => `${(px / SKYLINE_WIDTH) * 100}%`;

/** Lo-fi (FocoLofi.html): moon, glow of the horizon, spinning record, dust, and the city at dusk. */
export const LofiLayer = memo(function LofiLayer({ reduced }: LayerProps) {
  const dust = useMemo(() => dustMotes(reduced), [reduced]);
  const windows = useMemo(() => litWindows(reduced), [reduced]);
  return (
    <>
      <div className={css.moon} />
      <div className={css.horizon} />
      <svg viewBox="0 0 300 300" className={css.record}>
        <circle cx="150" cy="150" r="148" fill="#15161F" />
        {GROOVES.map((r) => (
          <circle key={r} cx="150" cy="150" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}
        <circle cx="150" cy="150" r="52" fill="#F6BACB" />
        <circle cx="150" cy="150" r="6" fill="#15161F" />
        <path d="M150 98 A52 52 0 0 1 202 150" stroke="rgba(31,42,51,0.35)" strokeWidth="10" fill="none" />
      </svg>
      {dust.map((d, i) => (
        <span
          key={i}
          data-particle="dust"
          className={css.dust}
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            animationDuration: `${d.duration}s`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
      <div className={css.skyline}>
        {BUILDINGS.map(([left, width, height], building) => (
          <div
            key={building}
            data-building
            className={css.building}
            style={{ left: percent(left), width: percent(width), height }}
          >
            {windows
              .filter((w) => w.building === building)
              .map((w, i) => (
                <span
                  key={i}
                  data-particle="window"
                  className={css.litWindow}
                  style={{
                    left: w.left,
                    bottom: w.bottom,
                    animationDuration: `${w.duration}s`,
                    animationDelay: `${w.delay}s`,
                  }}
                />
              ))}
          </div>
        ))}
      </div>
    </>
  );
});
