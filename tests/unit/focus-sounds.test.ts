import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { silentWav } from "@/features/focus/silent-track";
import { SOUND_IDS } from "@/lib/focus/prefs";
import { FOCUS_SOUNDS, gainFor, pickSource, SOUND_CREDITS } from "@/lib/focus/sounds";

describe("sons do modo foco", () => {
  const audible = SOUND_IDS.filter((id) => id !== "silencio");

  it("todo som tem faixa, menos o Silêncio, e cada arquivo cabe em 1,5 MB", () => {
    expect(FOCUS_SOUNDS.silencio).toBeNull();
    for (const id of audible) {
      const sound = FOCUS_SOUNDS[id]!;
      const seconds = sound.loopEnd - sound.loopStart;
      expect(seconds, id).toBeGreaterThanOrEqual(60);
      expect(seconds, id).toBeLessThanOrEqual(180);
      for (const { src } of sound.sources) {
        expect(statSync(`public${src}`).size, src).toBeLessThanOrEqual(1.5 * 1024 * 1024);
      }
    }
  });

  it("toda faixa tem crédito CC0 no app e em CREDITS.md", () => {
    const file = readFileSync("public/sounds/CREDITS.md", "utf8");
    expect(SOUND_CREDITS.map((c) => c.sound)).toEqual(audible);
    for (const credit of SOUND_CREDITS) {
      expect(credit.license).toBe("CC0 1.0");
      for (const text of [credit.title, credit.author, credit.url]) expect(file).toContain(text);
    }
  });

  it("volume", () => {
    expect([0, 50, 100, 140, -5].map(gainFor)).toEqual([0, 0.25, 1, 1, 0]);
  });

  it("escolhe a primeira faixa que o navegador toca", () => {
    const sources = [
      { src: "a.m4a", type: "audio/mp4" },
      { src: "a.ogg", type: "audio/ogg" },
    ];
    expect(pickSource(sources, (t) => (t === "audio/ogg" ? "probably" : "")).src).toBe("a.ogg");
    expect(pickSource(sources, () => "maybe").src).toBe("a.m4a");
    expect(pickSource(sources, () => "").src).toBe("a.m4a");
  });

  it("a faixa silenciosa é um WAV de 10 s só com silêncio", async () => {
    const bytes = new Uint8Array(await silentWav().arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
    expect(bytes.length).toBe(44 + 80_000);
    expect(bytes.slice(44).every((b) => b === 128)).toBe(true);
  });
});
