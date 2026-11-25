import type { SoundId } from "./prefs";

export interface SoundSource {
  src: string;
  /** For canPlayType. */
  type: string;
}

export interface FocusSound {
  /** In order of preference. */
  sources: readonly SoundSource[];
  /**
   * Seconds. Each file is the loop plus half a second of itself before and after, so any delay an
   * encoder or decoder adds shifts both points equally and the seam never shows.
   */
  loopStart: number;
  loopEnd: number;
}

const m4a = (name: string): SoundSource => ({ src: `/sounds/${name}.m4a`, type: 'audio/mp4; codecs="mp4a.40.2"' });

function sound(name: string, loopSeconds: number): FocusSound {
  return { sources: [m4a(name)], loopStart: 0.5, loopEnd: 0.5 + loopSeconds };
}

/** Where the files come from, and their licenses: public/sounds/CREDITS.md and SOUND_CREDITS. */
export const FOCUS_SOUNDS: Record<SoundId, FocusSound | null> = {
  // A new file name on purpose: the one before stays in the cache of who already played it.
  chuva: sound("chuva-2", 80),
  lofi: sound("lofi", 66.461542),
  deep: sound("deep", 90),
  silencio: null,
};

export interface SoundCredit {
  sound: SoundId;
  title: string;
  author: string;
  url: string;
  license: "CC0 1.0";
}

export const SOUND_CREDITS: readonly SoundCredit[] = [
  {
    sound: "chuva",
    title: "Medium Rain",
    author: "HECKFRICKER",
    url: "https://freesound.org/people/HECKFRICKER/sounds/656541/",
    license: "CC0 1.0",
  },
  {
    sound: "lofi",
    title: "Lofi music 001",
    author: "Luisalvaz",
    url: "https://commons.wikimedia.org/wiki/File:Lofi_music_001.wav",
    license: "CC0 1.0",
  },
  {
    sound: "deep",
    title: "Brown noise 15-00",
    author: "JPxG",
    url: "https://commons.wikimedia.org/wiki/File:Brown_noise_15-00_69kbps.mp3",
    license: "CC0 1.0",
  },
];

/** Loudness is heard roughly as the square of the gain: half of the slider sounds like half. */
export function gainFor(volume: number): number {
  return (Math.min(100, Math.max(0, volume)) / 100) ** 2;
}

/** First source the browser says it can play; the first one if it doesn't know. */
export function pickSource(sources: readonly SoundSource[], canPlay: (type: string) => string): SoundSource {
  return sources.find((s) => canPlay(s.type) !== "") ?? sources[0];
}
