"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { statusOf } from "@/lib/focus/timer";
import { useAudioState } from "./audio-state";
import { useTimerStore } from "./timer-store";
import { useAmbientAudio } from "./use-ambient-audio";
import { usePrefsStore } from "./use-focus-prefs";

function Player({ userId, onFocusScreen }: { userId: string; onFocusScreen: boolean }) {
  const prefs = usePrefsStore((s) => s.prefs);
  const prefsReady = usePrefsStore((s) => s.ready && s.userId === userId);
  const timerReady = useTimerStore((s) => s.ready);
  const muted = useAudioState((s) => s.muted);
  useAmbientAudio({
    sound: prefs.sound,
    volume: prefs.volume,
    muted,
    ready: prefsReady && timerReady,
    anySound: onFocusScreen,
  });
  return null;
}

/**
 * The sound of the session, on every screen. It lives in the root because the app's layouts are
 * swapped when she minimizes the focus mode, and the sound must not stop then. It is let go when
 * there is nothing to play: no session, outside the focus screen, or signed out.
 */
export function FocusAudio() {
  const { user, status } = useAuth();
  const onFocusScreen = usePathname() === "/foco";
  const owner = useTimerStore((s) => s.userId);
  const active = useTimerStore((s) => statusOf(s.timer) !== "idle" || s.timer.phase === "break");
  const unload = useTimerStore((s) => s.unload);

  // Signed out without reloading the page: the session goes with her.
  useEffect(() => {
    if (status !== "signed-out") return;
    unload();
    useAudioState.setState({ muted: false });
  }, [status, unload]);

  if (!user || owner !== user.id || !(active || onFocusScreen)) return null;
  return <Player userId={user.id} onFocusScreen={onFocusScreen} />;
}
