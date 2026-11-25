"use client";

import { Pause, Play, RotateCcw, Settings, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { todayIn } from "@/lib/dates/calendar";
import { formatFocused } from "@/lib/focus/sessions";
import { useNow } from "@/lib/hooks/use-now";
import { advance, pause, reset, SESSIONS_PER_CYCLE, start, statusOf } from "@/lib/focus/timer";
import { useAudioState } from "./audio-state";
import { BreathText } from "./breath-text";
import { LeaveButtons } from "./leave-buttons";
import { PresetPicker } from "./preset-picker";
import { SoundPicker } from "./sound-picker";
import { SubjectPicker } from "./subject-picker";
import { ThemeBackdrop } from "./theme-backdrop";
import { ThemeLabel } from "./theme-label";
import { FOCUS_THEMES, themeStyle } from "./themes/registry";
import { TimerDial } from "./timer-dial";
import { useTimerStore } from "./timer-store";
import { useAnimation } from "./use-animation";
import { useFocusPrefs } from "./use-focus-prefs";
import { useFocusSummary } from "./use-focus-summary";

/** How long header and footer stay bright after a touch (Deep Focus rests at 0.6). */
const AWAKE_MS = 4000;

function useAwake() {
  const [awake, setAwake] = useState(false);
  const id = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(id.current), []);
  const wake = useCallback(() => {
    setAwake(true);
    clearTimeout(id.current);
    id.current = setTimeout(() => setAwake(false), AWAKE_MS);
  }, []);
  return { awake, wake };
}

/** Where the center of the ring is, for the decoration that surrounds it (--ring-y). */
function useRingCenter(root: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const screen = root.current;
    const ring = screen?.querySelector("[data-ring]");
    if (!screen || !ring) return;
    const place = () => {
      const box = ring.getBoundingClientRect();
      const y = box.top + box.height / 2 - screen.getBoundingClientRect().top;
      screen.style.setProperty("--ring-y", `${Math.round(y)}px`);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(screen);
    observer.observe(ring);
    // The ring can move without resizing: the label at the top takes room from this area.
    if (ring.parentElement) observer.observe(ring.parentElement);
    return () => observer.disconnect();
  }, [root]);
}

function Controls() {
  const status = useTimerStore((s) => statusOf(s.timer));
  const phase = useTimerStore((s) => s.timer.phase);
  const act = useTimerStore((s) => s.act);
  const round =
    "flex size-13 items-center justify-center rounded-full border border-(--focus-line) bg-transparent text-white";
  return (
    <div className="flex items-center gap-5">
      <button type="button" aria-label="Reiniciar" className={round} onClick={() => act(reset)}>
        <RotateCcw aria-hidden size={22} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        aria-label={status === "running" ? "Pausar" : status === "paused" ? "Continuar" : "Iniciar"}
        onClick={() => act(status === "running" ? pause : start)}
        className="flex size-18 items-center justify-center rounded-full bg-white text-night-900"
      >
        {status === "running" ? (
          <Pause aria-hidden size={28} strokeWidth={2.5} />
        ) : (
          <Play aria-hidden size={28} strokeWidth={2} fill="currentColor" className="translate-x-0.5" />
        )}
      </button>
      <button
        type="button"
        aria-label={phase === "focus" ? "Pular para a pausa" : "Pular para o foco"}
        className={round}
        onClick={() => act(advance)}
      >
        <SkipForward aria-hidden size={22} strokeWidth={1.75} />
      </button>
    </div>
  );
}

/** Sessions, time and points of the day: they change as soon as a session ends. */
function DayStats() {
  const now = useNow();
  const day = useFocusSummary(now ? todayIn(now) : null);
  const sessions = day?.sessions ?? 0;
  const extra = sessions - SESSIONS_PER_CYCLE;
  return (
    <div className="flex items-center justify-center gap-6">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-(--focus-muted)">Sessões hoje</span>
        <span
          role="img"
          aria-label={extra > 0 ? `${sessions} sessões` : `${sessions} de ${SESSIONS_PER_CYCLE}`}
          className="flex items-center gap-1.5"
        >
          {Array.from({ length: SESSIONS_PER_CYCLE }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                "size-3 rounded-full border-2 border-(--focus-accent)",
                i < sessions && "bg-(--focus-accent)",
              )}
            />
          ))}
          {extra > 0 && (
            <span aria-hidden className="text-xs leading-3 font-bold">
              +{extra}
            </span>
          )}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-lg leading-6 font-bold">{day ? formatFocused(day.minutes) : "–"}</span>
        <span className="text-xs text-(--focus-muted)">focada hoje</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-lg leading-6 font-bold">{day ? `+${day.points} pts` : "–"}</span>
        <span className="text-xs text-(--focus-muted)">no ranking hoje</span>
      </div>
    </div>
  );
}

/** Modo foco (Foco.html and its themes): the theme is only the skin, the clock doesn't know it. */
export function FocusScreen() {
  const ready = useTimerStore((s) => s.ready);
  const { prefs, ready: prefsReady, update } = useFocusPrefs();
  const saveAnimation = useCallback((animation: boolean) => update({ animation }), [update]);
  const { animation, setAnimation } = useAnimation(prefs.animation, saveAnimation);
  const { awake, wake } = useAwake();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const muted = useAudioState((s) => s.muted);
  const theme = FOCUS_THEMES[prefs.sound];
  const screen = useRef<HTMLDivElement>(null);
  useRingCenter(screen);

  // "Estudar com foco" on a subject's page. Never under a session that already started.
  const params = useSearchParams();
  const subjectParam = params.get("materia");
  useEffect(() => {
    if (!ready || !subjectParam) return;
    useTimerStore
      .getState()
      .act((t) =>
        t.startedAt === null && t.subjectId !== subjectParam ? { ...t, subjectId: subjectParam, topicId: null } : t,
      );
  }, [ready, subjectParam]);

  const chrome =
    "relative z-10 transition-opacity duration-300 hover:opacity-100 focus-within:opacity-100 " +
    (awake ? "opacity-100" : "opacity-(--focus-chrome-opacity)");

  return (
    <div
      ref={screen}
      data-focus-theme={prefs.sound}
      data-ready={ready && prefsReady ? "" : undefined}
      style={themeStyle(theme)}
      className="relative flex min-h-dvh flex-col overflow-hidden bg-night-950 text-white [--ring:clamp(200px,min(78vw,100dvh-430px),380px)]"
    >
      <ThemeBackdrop sound={prefs.sound} animation={animation} showFps={params.get("fps") === "1"} />

      <header
        onPointerDown={wake}
        className={`${chrome} grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-[max(20px,env(safe-area-inset-left))] pt-[max(16px,env(safe-area-inset-top))] pb-2 md:grid-cols-[1fr_auto_1fr] md:px-8 md:pt-[max(24px,env(safe-area-inset-top))]`}
      >
        <div className="flex flex-wrap gap-2 justify-self-start">
          <LeaveButtons />
        </div>
        <span className="order-last col-span-2 flex items-center justify-center gap-2 text-sm font-semibold text-(--focus-muted) empty:hidden md:order-none md:col-span-1 md:empty:flex">
          <ThemeLabel sound={prefs.sound} animation={animation} />
        </span>
        <div className="flex gap-2 justify-self-end">
          {prefs.sound !== "silencio" && (
            <IconButton
              icon={muted ? VolumeX : Volume2}
              label={muted ? "Ativar o som" : "Silenciar o som"}
              aria-pressed={muted}
              variant="on-dark"
              onClick={() => useAudioState.setState({ muted: !muted })}
            />
          )}
          <IconButton
            icon={Settings}
            label="Ajustes do modo foco"
            variant="on-dark"
            onClick={() => setSettingsOpen(true)}
          />
        </div>
      </header>

      <main
        id="conteudo"
        className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 px-5 py-3 md:gap-5"
      >
        <h1 className="sr-only">Modo foco</h1>
        <SubjectPicker />
        <TimerDial>{prefs.sound === "deep" && animation && prefs.breathText && <BreathText />}</TimerDial>
        <Controls />
        <PresetPicker />
      </main>

      <footer
        onPointerDown={wake}
        className={`${chrome} mx-[max(16px,env(safe-area-inset-left))] mb-[max(16px,env(safe-area-inset-bottom))] flex flex-col items-center gap-3 rounded-[22px] bg-(--focus-footer-bg) px-4 py-3 md:mx-8 md:px-6 lg:flex-row lg:justify-between`}
      >
        <DayStats />
        <SoundPicker prefs={prefs} animation={animation} onChange={update} onAnimationChange={setAnimation} />
      </footer>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Ajustes do modo foco" size="s">
        <Switch
          checked={prefs.breathText}
          onChange={(breathText) => update({ breathText })}
          label="Texto de respiração"
          description="“Inspire” e “Expire” dentro do anel, no Deep Focus."
        />
      </Sheet>
    </div>
  );
}
