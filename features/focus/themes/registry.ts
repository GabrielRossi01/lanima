import type { ComponentType, CSSProperties } from "react";
import { SOUND_IDS, type SoundId } from "@/lib/focus/prefs";
import { LofiLayer } from "./lofi-layer";
import { RainLayer } from "./rain-layer";

export interface LayerProps {
  /** Weak device: half of the particles. */
  reduced: boolean;
}

/** Colors that exist only inside a theme. Everything in the screen reads these, never a hex. */
export interface ThemeVars {
  "--focus-bg": string;
  /** Ring, switch, slider and the selected sound. */
  "--focus-accent": string;
  "--focus-track": string;
  "--focus-footer-bg": string;
  "--focus-chip-bg": string;
  /** Behind the durations, where the decoration is busy. */
  "--focus-pill-bg": string;
  "--focus-line": string;
  /** Secondary text. */
  "--focus-muted": string;
  /** Header and footer at rest. */
  "--focus-chrome-opacity": string;
}

export interface FocusTheme {
  id: SoundId;
  label: string;
  /** Centered at the top; null where the mockup has nothing that is true in a browser. */
  topLabel: string | null;
  /** Replaces topLabel while the sound is really playing. */
  playingLabel?: string;
  cssVars: ThemeVars;
  /** Decorative layer; only the silence has none. */
  Layer: ComponentType<LayerProps> | null;
}

const translucent = {
  "--focus-pill-bg": "transparent",
  "--focus-track": "rgba(255, 255, 255, 0.12)",
  "--focus-line": "rgba(255, 255, 255, 0.22)",
  "--focus-chrome-opacity": "1",
} as const;

export const FOCUS_THEMES: Record<SoundId, FocusTheme> = {
  chuva: {
    id: "chuva",
    label: "Chuva",
    topLabel: "Chuva na janela",
    cssVars: {
      ...translucent,
      "--focus-bg": "linear-gradient(180deg, #2A3A47 0%, #1E2B36 45%, #141B21 100%)",
      "--focus-accent": "#B3D8F2",
      "--focus-footer-bg": "rgba(20, 27, 33, 0.55)",
      "--focus-chip-bg": "rgba(179, 216, 242, 0.18)",
      "--focus-muted": "rgba(255, 255, 255, 0.8)",
    },
    Layer: RainLayer,
  },
  lofi: {
    id: "lofi",
    label: "Lo-fi",
    topLabel: "Lo-fi",
    playingLabel: "Lo-fi · tocando agora",
    cssVars: {
      ...translucent,
      "--focus-bg": "linear-gradient(180deg, #1F2A33 0%, #34304A 45%, #5E4A62 78%, #8A6470 100%)",
      "--focus-accent": "#F6BACB",
      "--focus-footer-bg": "rgba(27, 28, 43, 0.6)",
      "--focus-chip-bg": "rgba(246, 186, 203, 0.2)",
      // The lit windows pass behind the durations.
      "--focus-pill-bg": "rgba(24, 24, 38, 0.72)",
      // Brighter than the others: the sky is lighter at the bottom.
      "--focus-muted": "rgba(255, 255, 255, 0.94)",
    },
    Layer: LofiLayer,
  },
  deep: {
    id: "deep",
    label: "Deep Focus",
    topLabel: "Deep Focus · respiração 5 s",
    cssVars: {
      ...translucent,
      "--focus-bg": "radial-gradient(circle at 50% 52%, #13212B 0%, #0B1217 60%, #06090C 100%)",
      "--focus-accent": "#9FB3C0",
      "--focus-footer-bg": "rgba(255, 255, 255, 0.04)",
      "--focus-chip-bg": "rgba(159, 179, 192, 0.2)",
      // White: header and footer rest at 0.6, and small text must still reach 4.5:1.
      "--focus-muted": "#FFFFFF",
      "--focus-chrome-opacity": "0.6",
    },
    Layer: null,
  },
  silencio: {
    id: "silencio",
    label: "Silêncio",
    topLabel: null,
    cssVars: {
      "--focus-bg": "radial-gradient(circle at 50% 45%, #2E404D 0%, #1F2A33 55%, #141B21 100%)",
      "--focus-accent": "#9FB3C0",
      "--focus-track": "#2E404D",
      "--focus-footer-bg": "#2E404D",
      "--focus-chip-bg": "#3E5566",
      "--focus-pill-bg": "transparent",
      "--focus-line": "#3E5566",
      "--focus-muted": "#C2CFD8",
      "--focus-chrome-opacity": "1",
    },
    Layer: null,
  },
};

/** In the order of the footer. */
export const FOCUS_THEME_LIST: readonly FocusTheme[] = SOUND_IDS.map((id) => FOCUS_THEMES[id]);

export function themeStyle(theme: FocusTheme): CSSProperties {
  return theme.cssVars as unknown as CSSProperties;
}
