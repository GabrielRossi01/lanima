"use client";

import { useSyncExternalStore } from "react";

const MINUTE = 60_000;
let cached: Date | null = null;

function subscribe(onChange: () => void) {
  const id = window.setInterval(() => {
    cached = new Date();
    onChange();
  }, MINUTE);
  const onVisible = () => {
    if (document.visibilityState === "visible") {
      cached = new Date();
      onChange();
    }
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

function getSnapshot() {
  cached ??= new Date();
  return cached;
}

/**
 * Current time, refreshed every minute and when the app returns to the foreground.
 * `null` on the server: time-dependent UI renders after hydration, so the
 * prerendered shell never bakes in the build time.
 */
export function useNow(): Date | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
