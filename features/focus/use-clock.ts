"use client";

import { useLayoutEffect, useState } from "react";
import { msToNextSecond, remainingMs } from "@/lib/focus/timer";
import { useTimerStore } from "./timer-store";

/** Current time, refreshed when the shown second changes. Only who shows the clock follows it. */
export function useClock(running: boolean): number {
  const timer = useTimerStore((s) => s.timer);
  const [now, setNow] = useState(() => Date.now());
  // Before paint: right after resuming, the last known time is from before the pause, and one frame
  // with it would flash a wrong clock.
  useLayoutEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (running) id = setTimeout(tick, Math.max(16, msToNextSecond(remainingMs(timer, current))));
    };
    tick();
    // Timers are throttled in the background: catch up as soon as she is back.
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [running, timer]);
  return now;
}
