import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio, parseTokens } from "@/lib/theme/contrast";

const css = readFileSync("app/globals.css", "utf8");
const light = parseTokens(css, ':root,\n[data-theme="light"]');
const dark = parseTokens(css, '[data-theme="dark"]');

const WHITE = "#FFFFFF";
const TEXT_MIN = 4.5;
/** WCAG 1.4.11: borders and fills that carry meaning (correct/incorrect answer outlines). */
const NON_TEXT_MIN = 3;

type Pair = [fg: string, bg: string];

/** Every text/background pairing the UI uses. Names refer to tokens, `white` is literal. */
const TEXT_PAIRS: Pair[] = [
  ["text", "bg"],
  ["text", "surface"],
  ["text", "surface-alt"],
  ["text", "subtle"],
  ["text", "active"],
  ["text-2", "bg"],
  ["text-2", "surface"],
  ["text-2", "surface-alt"],
  ["text-2", "subtle"],
  ["accent", "bg"],
  ["accent", "surface"],
  ["accent", "surface-alt"],
  ["accent", "active"],
  ["white", "btn"],
  ["white", "deep"],
  ["on-deep-2", "deep"],
  ["success-text", "surface"],
  ["success-text", "surface-alt"],
  ["danger-text", "surface"],
  ["danger-text", "surface-alt"],
  ["warning-text", "surface"],
  // Make-up exams.
  ["white", "exam"],
  ["on-deep-2", "exam"],
  ["text", "exam-tint"],
  ["text-2", "exam-tint"],
  ["danger-text", "exam-tint"],
  // Selected filter chip: inverted colors.
  ["bg", "text"],
];

const PASTELS = [
  "hl-yellow",
  "hl-pink",
  "hl-green",
  "hl-sky",
  "hl-lilac",
  "hl-peach",
  "hl-lime",
  "hl-teal",
  "hl-indigo",
  "hl-orchid",
];

function color(tokens: Record<string, string>, name: string): string {
  if (name === "white") return WHITE;
  const value = tokens[name];
  if (!value) throw new Error(`Missing token --${name}`);
  return value;
}

describe.each([
  ["claro", light],
  ["escuro", dark],
] as const)("tema %s", (_name, tokens) => {
  it("define todos os tokens da seção 4.1", () => {
    for (const token of [
      "bg",
      "surface",
      "surface-alt",
      "subtle",
      "text",
      "text-2",
      "accent",
      "brand",
      "btn",
      "active",
      "deep",
      "border",
      "border-strong",
      "ink",
      "success",
      "warning",
      "danger",
    ]) {
      expect(tokens[token], `--${token}`).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it.each(TEXT_PAIRS)("texto %s sobre %s tem contraste de pelo menos 4,5:1", (fg, bg) => {
    expect(contrastRatio(color(tokens, fg), color(tokens, bg))).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it.each(PASTELS)("--ink sobre %s tem contraste de pelo menos 4,5:1", (pastel) => {
    expect(contrastRatio(color(tokens, "ink"), color(tokens, pastel))).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it.each(["success", "danger"])("borda de correção --%s se destaca da superfície (3:1)", (state) => {
    expect(contrastRatio(color(tokens, state), color(tokens, "surface"))).toBeGreaterThanOrEqual(NON_TEXT_MIN);
  });

  it("nunca usa preto puro", () => {
    for (const value of Object.values(tokens)) expect(value).not.toBe("#000000");
  });
});

describe("marca-texto no tema escuro", () => {
  it.each(["yellow", "pink", "green", "sky", "lilac"])("texto sobre --marker-%s tem 4,5:1", (m) => {
    expect(contrastRatio(color(dark, "text"), color(dark, `marker-${m}`))).toBeGreaterThanOrEqual(TEXT_MIN);
  });
});

describe("valores exatos da especificação", () => {
  it("mantém as cores de identidade", () => {
    expect(light.bg).toBe("#F5F6F5");
    expect(dark.bg).toBe("#12181D");
    expect(light.btn).toBe("#4B6577");
    expect(dark.btn).toBe("#4B6577");
    expect(light.ink).toBe(dark.ink);
  });

  it("contrastRatio confere com valores de referência", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
  });
});
