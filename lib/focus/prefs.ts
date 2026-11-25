import { z } from "zod";

/** Focus sounds; each one is also a visual theme, except "silencio". Same keys as the database. */
export const SOUND_IDS = ["chuva", "lofi", "deep", "silencio"] as const;
export type SoundId = (typeof SOUND_IDS)[number];

export const SOUND_LABELS: Record<SoundId, string> = {
  chuva: "Chuva",
  lofi: "Lo-fi",
  deep: "Deep Focus",
  silencio: "Silêncio",
};

export const focusPrefsSchema = z.object({
  sound: z.enum(SOUND_IDS),
  /** 0 to 100. */
  volume: z.number().int().min(0).max(100),
  animation: z.boolean(),
  /** "Inspire / Expire" inside the ring, in Deep Focus. */
  breathText: z.boolean(),
});
export type FocusPrefs = z.infer<typeof focusPrefsSchema>;

export const DEFAULT_PREFS: FocusPrefs = { sound: "silencio", volume: 60, animation: true, breathText: true };

/** Columns of `profiles`. Copies saved on the device before they existed don't have them. */
export interface PrefsColumns {
  focus_sound?: string;
  focus_volume?: number;
  focus_animation?: boolean;
  focus_breath_text?: boolean;
}

export function prefsFromProfile(profile: PrefsColumns): FocusPrefs {
  const pick = <K extends keyof FocusPrefs>(key: K, value: unknown): FocusPrefs[K] => {
    const parsed = focusPrefsSchema.shape[key].safeParse(value);
    return (parsed.success ? parsed.data : DEFAULT_PREFS[key]) as FocusPrefs[K];
  };
  return {
    sound: pick("sound", profile.focus_sound),
    volume: pick("volume", profile.focus_volume),
    animation: pick("animation", profile.focus_animation),
    breathText: pick("breathText", profile.focus_breath_text),
  };
}

export function prefsToColumns(prefs: FocusPrefs): Required<PrefsColumns> {
  return {
    focus_sound: prefs.sound,
    focus_volume: prefs.volume,
    focus_animation: prefs.animation,
    focus_breath_text: prefs.breathText,
  };
}

export function samePrefs(a: FocusPrefs, b: FocusPrefs): boolean {
  return a.sound === b.sound && a.volume === b.volume && a.animation === b.animation && a.breathText === b.breathText;
}
