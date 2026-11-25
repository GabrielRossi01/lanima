import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, prefsFromProfile, prefsToColumns, samePrefs, SOUND_IDS } from "@/lib/focus/prefs";
import {
  advance,
  choosePreset,
  elapsedMs,
  formatClock,
  initialTimer,
  isOver,
  msToNextSecond,
  pause,
  PRESETS,
  remainingMs,
  reset,
  start,
  statusOf,
  timerSchema,
} from "@/lib/focus/timer";
import { FOCUS_THEMES, FOCUS_THEME_LIST } from "@/features/focus/themes/registry";
import { contrastRatio } from "@/lib/theme/contrast";

const MIN = 60_000;
const t0 = 1_800_000_000_000;

describe("cronômetro por horários", () => {
  it("conta pelo relógio, esteja o app aberto ou não", () => {
    const running = start(initialTimer(), t0);
    expect(statusOf(running)).toBe("running");
    expect(remainingMs(running, t0)).toBe(25 * MIN);
    expect(remainingMs(running, t0 + 10 * MIN)).toBe(15 * MIN);
    // Closed for 40 minutes: it ended, it didn't stop.
    expect(remainingMs(running, t0 + 40 * MIN)).toBe(0);
    expect(isOver(running, t0 + 40 * MIN)).toBe(true);
  });

  it("pausas não contam, mesmo várias", () => {
    let timer = start(initialTimer(), t0);
    timer = pause(timer, t0 + 5 * MIN);
    expect(statusOf(timer)).toBe("paused");
    expect(remainingMs(timer, t0 + 60 * MIN)).toBe(20 * MIN);
    expect(isOver(timer, t0 + 60 * MIN)).toBe(false);
    timer = start(timer, t0 + 15 * MIN);
    timer = pause(timer, t0 + 20 * MIN);
    timer = start(timer, t0 + 21 * MIN);
    expect(timer.startedAt).toBe(t0);
    expect(elapsedMs(timer, t0 + 22 * MIN)).toBe(11 * MIN);
  });

  it("repetir uma ação não muda nada", () => {
    const running = start(initialTimer(), t0);
    expect(start(running, t0 + MIN)).toBe(running);
    const idle = initialTimer();
    expect(pause(idle, t0)).toBe(idle);
  });

  it("relógio do aparelho atrasado não dá tempo negativo", () => {
    expect(elapsedMs(start(initialTimer(), t0), t0 - MIN)).toBe(0);
  });

  it("foco → pausa → próxima sessão, e a 4ª volta para a 1ª", () => {
    const rest = advance(start(initialTimer(), t0));
    expect([rest.phase, rest.session, statusOf(rest)]).toEqual(["break", 1, "idle"]);
    expect(remainingMs(rest, t0)).toBe(5 * MIN);
    expect(advance(rest)).toMatchObject({ phase: "focus", session: 2 });
    expect(advance({ ...rest, session: 4 })).toMatchObject({ phase: "focus", session: 1 });
  });

  it("predefinição só muda antes de começar; reiniciar volta ao começo da fase", () => {
    const idle = choosePreset(initialTimer(), PRESETS[1]);
    expect(remainingMs(idle, t0)).toBe(50 * MIN);
    const running = start(idle, t0);
    expect(choosePreset(running, PRESETS[2])).toBe(running);
    expect(statusOf(reset(running))).toBe("idle");
    expect(reset(running).preset).toEqual(PRESETS[1]);
  });

  it("mostra o tempo como no mockup", () => {
    expect([25 * MIN, 25 * MIN - 1, 24 * MIN + 59_000, 9_000, 1, 0, 120 * MIN].map(formatClock)).toEqual([
      "25:00",
      "25:00",
      "24:59",
      "00:09",
      "00:01",
      "00:00",
      "120:00",
    ]);
    expect([5000, 4200, 1, 0].map(msToNextSecond)).toEqual([1000, 200, 1, 0]);
  });

  it("recusa um estado salvo inválido", () => {
    expect(timerSchema.safeParse(initialTimer()).success).toBe(true);
    expect(timerSchema.safeParse({ ...initialTimer(), session: 9 }).success).toBe(false);
    expect(timerSchema.safeParse({}).success).toBe(false);
  });
});

describe("preferências do foco", () => {
  it("vão e voltam do perfil", () => {
    const prefs = { sound: "lofi", volume: 35, animation: false, breathText: false } as const;
    expect(prefsFromProfile(prefsToColumns(prefs))).toEqual(prefs);
    expect(samePrefs(prefs, { ...prefs })).toBe(true);
    expect(samePrefs(prefs, { ...prefs, volume: 36 })).toBe(false);
  });

  it("perfil antigo ou valor desconhecido usa o padrão", () => {
    expect(prefsFromProfile({})).toEqual(DEFAULT_PREFS);
    expect(prefsFromProfile({ focus_sound: "marrom", focus_volume: 300 })).toEqual(DEFAULT_PREFS);
  });
});

describe("temas", () => {
  it("todo som tem tema", () => {
    expect(FOCUS_THEME_LIST.map((t) => t.id)).toEqual([...SOUND_IDS]);
    expect(new Set(FOCUS_THEME_LIST.map((t) => t.cssVars["--focus-bg"])).size).toBe(4);
    expect(FOCUS_THEMES.silencio.Layer).toBeNull();
  });

  type Rgb = [number, number, number];
  const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
  const toHex = (c: Rgb) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  function parse(value: string): { rgb: Rgb; a: number } {
    if (value.startsWith("#")) return { rgb: hex(value), a: 1 };
    const [r, g, b, a] = value.match(/[\d.]+/g)!.map(Number);
    return { rgb: [r, g, b], a };
  }
  const over = (top: { rgb: Rgb; a: number }, under: Rgb, opacity = 1): Rgb =>
    under.map((v, i) => v + (top.rgb[i] - v) * top.a * opacity) as Rgb;

  it.each(FOCUS_THEME_LIST.map((t) => [t.id, t] as const))(
    "%s: texto secundário com 4,5:1 em todo o fundo e no rodapé, mesmo em repouso",
    (_id, theme) => {
      const vars = theme.cssVars;
      const opacity = Number(vars["--focus-chrome-opacity"]);
      const muted = parse(vars["--focus-muted"]);
      for (const stop of vars["--focus-bg"].match(/#[0-9A-F]{6}/gi)!) {
        const sky = hex(stop);
        // Straight on the background (presets, session).
        expect(contrastRatio(toHex(over(muted, sky)), stop), `${stop} direto`).toBeGreaterThanOrEqual(4.5);
        // In the footer: its own background and the text both fade with the footer.
        const footer = over(parse(vars["--focus-footer-bg"]), sky, opacity);
        const text = over(muted, footer, opacity);
        expect(contrastRatio(toHex(text), toHex(footer)), `${stop} no rodapé`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});
