"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "@/components/ui/toast";
import { SOUND_LABELS, type SoundId } from "@/lib/focus/prefs";
import { FOCUS_SOUNDS } from "@/lib/focus/sounds";
import { pause, start, statusOf } from "@/lib/focus/timer";
import { AmbientPlayer } from "./ambient-player";
import { useAudioState } from "./audio-state";
import { unlockEndSound } from "./end-alert";
import { silentWav } from "./silent-track";
import { useTimerStore } from "./timer-store";

const ARTWORK: MediaImage[] = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
];

interface AmbientAudio {
  sound: SoundId;
  volume: number;
  muted: boolean;
  /** False while the saved preferences are still being read. */
  ready: boolean;
  /** Any sound may be chosen next (focus screen): a tap there already unlocks the audio. */
  anySound: boolean;
}

/**
 * The sound follows the timer: it plays while a session runs and fades out when it pauses. The
 * controls of the lock screen act on the timer, so pausing there pauses the session.
 */
export function useAmbientAudio({ sound, volume, muted, ready, anySound }: AmbientAudio) {
  const player = useRef<AmbientPlayer>(undefined);
  const silence = useRef<HTMLAudioElement>(undefined);
  const status = useTimerStore((s) => statusOf(s.timer));
  const playing = useAudioState((s) => s.playing);
  const track = FOCUS_SOUNDS[sound];
  const wanted = ready && status === "running" && track !== null;

  useEffect(() => {
    const created = new AmbientPlayer((value) => useAudioState.setState({ playing: value }));
    player.current = created;
    const element = new Audio();
    element.loop = true;
    const url = URL.createObjectURL(silentWav());
    element.src = url;
    silence.current = element;
    return () => {
      created.close();
      element.pause();
      URL.revokeObjectURL(url);
      useAudioState.setState({ playing: false });
    };
  }, []);

  useEffect(() => player.current?.setVolume(muted ? 0 : volume), [volume, muted]);

  const sync = useCallback(() => {
    const current = player.current;
    if (!current) return;
    if (!wanted || !track) {
      current.stop();
      silence.current?.pause();
      return;
    }
    void silence.current?.play().catch(() => {}); // Without a gesture yet: the next tap tries again.
    current.play(track).catch(() => {
      toast({
        title: `Não foi possível tocar ${SOUND_LABELS[sound]}`,
        description: navigator.onLine
          ? "O cronômetro continua normalmente."
          : "Esse som ainda não foi baixado neste aparelho.",
        tone: "danger",
      });
    });
  }, [wanted, track, sound]);

  useEffect(sync, [sync]);

  // Any tap unlocks the sound (iOS): on "Iniciar", on a sound, or after coming back to a session
  // that was already running.
  const unlockable = anySound || track !== null;
  useEffect(() => {
    if (!unlockable) return;
    const onGesture = () => {
      const current = player.current;
      if (!current || current.unlocked) return;
      current.unlock();
      sync();
    };
    document.addEventListener("click", onGesture, true);
    document.addEventListener("keydown", onGesture, true);
    return () => {
      document.removeEventListener("click", onGesture, true);
      document.removeEventListener("keydown", onGesture, true);
    };
  }, [sync, unlockable]);

  // Lock screen and media keys, only while there is a session: on the other screens, the play key of
  // a headset must not start one.
  const controls = track !== null && status !== "idle";
  useEffect(() => {
    if (!("mediaSession" in navigator) || !controls) return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({
      title: `Lanima · ${SOUND_LABELS[sound]}`,
      artist: "Modo foco",
      artwork: ARTWORK,
    });
    const { act } = useTimerStore.getState();
    session.setActionHandler("play", () => {
      player.current?.unlock();
      unlockEndSound();
      act(start);
    });
    session.setActionHandler("pause", () => act(pause));
    return () => {
      session.metadata = null;
      session.setActionHandler("play", null);
      session.setActionHandler("pause", null);
      session.playbackState = "none";
    };
  }, [sound, controls]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !controls) return;
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, [playing, controls]);
}
