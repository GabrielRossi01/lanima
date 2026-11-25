"use client";

import type { ReactNode } from "react";
import { formatClock, plannedMs, remainingMs, SESSIONS_PER_CYCLE, statusOf } from "@/lib/focus/timer";
import { useTimerStore } from "./timer-store";
import { useClock } from "./use-clock";

const RADIUS = 176;
const LENGTH = 2 * Math.PI * RADIUS;

/** Ring and time. `children` goes over the ring, positioned by itself (breathing text). */
export function TimerDial({ children }: { children?: ReactNode }) {
  const timer = useTimerStore((s) => s.timer);
  const running = statusOf(timer) === "running";
  const now = useClock(running);
  const remaining = remainingMs(timer, now);
  const planned = plannedMs(timer);
  const clock = formatClock(remaining);

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
