/**
 * The soft sound and the vibration at the end of a focus session or a break. The sound is made on
 * the spot with Web Audio (two bell-like tones), so there is no file to download or cache.
 *
 * iOS only lets sound out of an AudioContext started by a tap, so `unlock` runs on her taps while
 * a session exists; when there is none, the context is suspended so it doesn't keep the audio
 * hardware awake.
 */
let context: AudioContext | null = null;
let suspendTimer: ReturnType<typeof setTimeout> | undefined;

/** Length of the sound, in seconds. */
const RING_S = 1.6;
/** A soft major sixth, a bit above the ambient sounds so it is heard over them. */
const TONES = [
  { frequency: 659.25, at: 0, gain: 0.16 },
  { frequency: 1046.5, at: 0.18, gain: 0.11 },
] as const;
/** Two short pulses. */
export const VIBRATION = [180, 120, 180];

/** Call from a tap: creates the context or wakes it up. */
export function unlockEndSound(): void {
  clearTimeout(suspendTimer);
  if (!context) {
    const Context = typeof window === "undefined" ? undefined : window.AudioContext;
    if (!Context) return;
    context = new Context();
  }
  if (context.state !== "running") void context.resume().catch(() => {});
}

/** No session anymore: lets the audio hardware rest once any sound still ringing is over. */
export function restEndSound(): void {
  clearTimeout(suspendTimer);
  suspendTimer = setTimeout(
    () => {
      if (context?.state === "running") void context.suspend().catch(() => {});
    },
    (RING_S + 0.5) * 1000,
  );
}

function ring(): void {
  if (!context || context.state !== "running") return;
  const now = context.currentTime;
  for (const tone of TONES) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = tone.frequency;
    const start = now + tone.at;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(tone.gain, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + RING_S);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + RING_S + 0.05);
  }
}

/** The end of a phase, as it happens. `sound` is false when she muted the app's sound. */
export function alertEnd({ sound }: { sound: boolean }): void {
  if (sound) ring();
  // Android only: Safari has no vibration.
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(VIBRATION);
    } catch {
      // Some browsers refuse it without a recent tap.
    }
  }
}
