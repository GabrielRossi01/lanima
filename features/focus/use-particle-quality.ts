"use client";

import { useEffect, useState } from "react";
import { isApple, isTooSlow, MEASURE_MS, startsReduced } from "@/lib/focus/quality";

/** Decided once per visit: going back and forth between half and full would be worse than either. */
let reducedForVisit: boolean | undefined;

function initial(): boolean {
  reducedForVisit ??= startsReduced({
    cores: navigator.hardwareConcurrency,
    apple: isApple(navigator.userAgent),
  });
  return reducedForVisit;
}

/**
 * Whether to use half of the particles: weak device, or less than 50 fps on average in the first
 * 3 s of an animated theme. Time with the tab hidden doesn't count (there are no frames then).
 */
export function useParticleQuality(theme: string, active: boolean): boolean {
  const [reduced, setReduced] = useState(initial);

  useEffect(() => {
    if (!active || reduced) return;
    let frames = 0;
    let visibleMs = 0;
    let last: number | null = null;
    let id = requestAnimationFrame(function frame(now) {
      if (document.hidden) last = null;
      else {
        if (last !== null) {
          frames++;
          visibleMs += now - last;
        }
        last = now;
      }
      if (visibleMs < MEASURE_MS) {
        id = requestAnimationFrame(frame);
      } else if (isTooSlow(frames, visibleMs)) {
        reducedForVisit = true;
        setReduced(true);
      }
    });
    // Coming back to the tab: the gap isn't a slow frame.
    const onVisibility = () => (last = null);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [theme, active, reduced]);

  return reduced;
}
