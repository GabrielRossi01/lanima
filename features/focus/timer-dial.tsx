"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { toast } from "@/components/ui/toast";
import { formatClock, msToNextSecond, plannedMs, remainingMs, SESSIONS_PER_CYCLE, statusOf } from "@/lib/focus/timer";
import { useTimerStore } from "./timer-store";

const RADIUS = 176;
const LENGTH = 2 * Math.PI * RADIUS;

/** Current time, refreshed when the shown second changes. Only this component follows the clock. */
function useClock(running: boolean): number {
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

/** Ring and time. `children` goes over the ring, positioned by itself (breathing text). */
export function TimerDial({ children }: { children?: ReactNode }) {
  const timer = useTimerStore((s) => s.timer);
  const finish = useTimerStore((s) => s.finish);
  const running = statusOf(timer) === "running";
  const now = useClock(running);
  const remaining = remainingMs(timer, now);
  const planned = plannedMs(timer);
  const clock = formatClock(remaining);

  useEffect(() => {
    if (!running || remaining > 0) return;
    const ended = finish();
    if (ended === "focus") toast({ title: "Sessão de foco concluída", description: "Hora da pausa.", tone: "success" });
    if (ended === "break")
      toast({ title: "Pausa concluída", description: "Pronto para a próxima sessão.", tone: "success" });
  }, [running, remaining, finish]);

  return (
    <div data-ring className="relative size-(--ring) shrink-0">
      <svg aria-hidden viewBox="0 0 380 380" className="absolute inset-0 size-full -rotate-90">
        <circle cx="190" cy="190" r={RADIUS} fill="none" stroke="var(--focus-track)" strokeWidth="8" />
        <circle
          cx="190"
          cy="190"
          r={RADIUS}
          fill="none"
          stroke="var(--focus-accent)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={LENGTH}
          strokeDashoffset={LENGTH * (1 - remaining / planned)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
        <span
          role="timer"
          aria-live="off"
          aria-label="Tempo restante"
          className="font-serif leading-none font-light tracking-[-2px] text-white tabular-nums"
          style={{ fontSize: `calc(var(--ring) * ${clock.length > 5 ? 0.22 : 0.274})` }}
        >
          {clock}
        </span>
        <span className="text-sm text-(--focus-muted)">
          Sessão {timer.session} de {SESSIONS_PER_CYCLE} · {timer.phase === "focus" ? "foco" : "pausa"}
        </span>
      </div>
      {children}
    </div>
  );
}
