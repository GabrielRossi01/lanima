"use client";

import { useEffect } from "react";

/**
 * Keeps the screen on while `active` (a running session), where the Screen Wake Lock API exists.
 * The browser lets go of the lock when the app goes to the background, so it is asked for again
 * when she comes back.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let asking = false;
    let done = false;

    const ask = async () => {
      if (done || asking || document.visibilityState !== "visible" || (lock && !lock.released)) return;
      asking = true;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (done) void next.release().catch(() => {});
        else lock = next;
      } catch {
        // Refused (battery saver, or not allowed here): the session goes on without it.
      } finally {
        asking = false;
      }
    };

    void ask();
    document.addEventListener("visibilitychange", ask);
    return () => {
      done = true;
      document.removeEventListener("visibilitychange", ask);
      if (lock && !lock.released) void lock.release().catch(() => {});
    };
  }, [active]);
}
