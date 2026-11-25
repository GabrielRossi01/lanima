"use client";

import { useCallback, useState } from "react";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";

const KEY = "lanima:focus-animation-reduced";

function readOverride(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Background animation in effect here. "Reduzir movimento" belongs to this device: there the switch
 * starts off and its choice stays on the device, without changing what the account saved. Turned
 * on, the layer shows still (themes.module.css never runs a keyframe under reduced motion).
 */
export function useAnimation(saved: boolean, save: (on: boolean) => void) {
  const reduced = useReducedMotion();
  const [override, setOverride] = useState(readOverride);
  const set = useCallback(
    (on: boolean) => {
      if (!reduced) return save(on);
      setOverride(on);
      try {
        localStorage.setItem(KEY, on ? "1" : "0");
      } catch {
        // Only for this visit, then.
      }
    },
    [reduced, save],
  );
  return { animation: reduced ? override : saved, setAnimation: set };
}
