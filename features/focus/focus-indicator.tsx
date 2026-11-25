"use client";

import { Pause, Play, SkipForward, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/cn";
import {
  advance,
  formatClock,
  pause,
  plannedMs,
  remainingMs,
  showsIndicator,
  start,
  statusOf,
} from "@/lib/focus/timer";
import { useNow } from "@/lib/hooks/use-now";
import { useAudioState } from "./audio-state";
import { useTimerStore } from "./timer-store";
import { useClock } from "./use-clock";
import { usePrefsStore } from "./use-focus-prefs";

type Variant = "card" | "rail" | "bar";

interface FocusIndicatorProps {
  /** Sidebar, icon rail (tablet portrait) or above the phone's tab bar. */
  variant: Variant;
  onNavigate?: () => void;
  className?: string;
}

/** Time left and how much already went by: the only part that follows the clock. */
function Remaining({ variant }: { variant: Variant }) {
  const timer = useTimerStore((s) => s.timer);
  const status = statusOf(timer);
  const left = remainingMs(timer, useClock(status === "running"));
  const label = timer.phase === "break" ? "Pausa" : "Foco";
  return (
    <>
      <span
        role="timer"
        aria-live="off"
        className={cn("font-bold tabular-nums", variant === "rail" ? "text-[13px] leading-5" : "text-lg leading-6")}
      >
        {formatClock(left)}
      </span>
      <span className={cn("truncate text-white/80", variant === "rail" ? "text-[11px]" : "text-xs")}>
        {status === "paused" ? "Parado" : label}
      </span>
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
        <span
          className="block h-full origin-left bg-white/70"
          style={{ transform: `scaleX(${1 - left / plannedMs(timer)})` }}
        />
      </span>
    </>
  );
}

/**
 * The session that goes on outside the focus screen: time left, pause, sound and the way back. Not
 * shown when there is nothing going on.
 */
export function FocusIndicator({ variant, onNavigate, className }: FocusIndicatorProps) {
  const now = useNow();
  const shown = useTimerStore((s) => s.ready && now !== null && showsIndicator(s.timer, now.getTime()));
  const status = useTimerStore((s) => statusOf(s.timer));
  const phase = useTimerStore((s) => s.timer.phase);
  const act = useTimerStore((s) => s.act);
  const muted = useAudioState((s) => s.muted);
  const hasSound = usePrefsStore((s) => s.prefs.sound !== "silencio");
  if (!shown) return null;

  const rail = variant === "rail";
  const waiting = status === "idle"; // A break that hasn't started.
  return (
    <section
      aria-label="Sessão de foco"
      data-focus-indicator={variant}
      className={cn(
        "flex overflow-hidden rounded-[14px] bg-night-800 text-white",
        variant === "bar" ? "fixed" : "relative",
        rail ? "w-14 flex-col items-center pb-2" : "items-center gap-1 pr-2",
        className,
      )}
    >
      <Link
        href="/foco"
        aria-label={phase === "break" ? "Voltar ao Modo foco, na pausa" : "Voltar ao Modo foco"}
        title="Voltar ao Modo foco"
        onClick={onNavigate}
        className={cn(
          "flex min-h-14 min-w-0 flex-col justify-center text-white no-underline hover:bg-white/10",
          rail ? "w-full items-center" : "flex-1 px-3.5",
        )}
      >
        <Remaining variant={variant} />
      </Link>
      {hasSound && !waiting && !rail && (
        <IconButton
          icon={muted ? VolumeX : Volume2}
          label={muted ? "Ativar o som" : "Silenciar o som"}
          aria-pressed={muted}
          variant="on-dark"
          size="s"
          onClick={() => useAudioState.setState({ muted: !muted })}
        />
      )}
      <IconButton
        icon={status === "running" ? Pause : Play}
        label={waiting ? "Iniciar a pausa" : status === "running" ? "Pausar a contagem" : "Continuar a contagem"}
        variant="on-dark"
        size="s"
        onClick={() => act(status === "running" ? pause : start)}
      />
      {waiting && (
        <IconButton
          icon={SkipForward}
          label="Pular a pausa"
          variant="on-dark"
          size="s"
          className={rail ? "mt-1.5" : undefined}
          onClick={() => act(advance)}
        />
      )}
    </section>
  );
}
