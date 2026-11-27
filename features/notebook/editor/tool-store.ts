"use client";

import { create } from "zustand";
import type { InkColor, InkTool } from "@/lib/ink/strokes";

/**
 * The notebook's tools (section 7.2), remembered on this device: tool, the color and thickness of
 * each writing tool, the eraser's mode, and "Desenhar com o dedo". Pen and pencil write in grafite
 * or azul cimento; the highlighter in the three highlighter colors: picking a swatch picks its tool.
 */

export type Tool = InkTool | "borracha" | "laco" | "texto";
export type SizeLevel = 0 | 1 | 2;
/** Whole strokes, or only what the eraser passes over. */
export type EraserMode = "traco" | "area";

export const PEN_COLORS = ["grafite", "azul"] as const satisfies readonly InkColor[];
export const MARKER_COLORS = ["amarelo", "rosa", "verde"] as const satisfies readonly InkColor[];

/** The eraser by area, in page units (about a fingertip on a tablet at 100%). */
export const ERASER_RADIUS = 14;
/** The eraser by stroke reaches this far around the pen. */
export const ERASER_REACH = 6;

export function isInkTool(tool: Tool): tool is InkTool {
  return tool === "caneta" || tool === "lapis" || tool === "marca_texto";
}

interface ToolState {
  tool: Tool;
  /** Last pen-like tool, for when a pen color is picked while the highlighter is on. */
  penTool: "caneta" | "lapis";
  colors: Record<InkTool, InkColor>;
  sizes: Record<InkTool, SizeLevel>;
  eraser: EraserMode;
  /** null: not chosen yet (on by default on phones, off on tablets). */
  fingerDraws: boolean | null;
}

const STORAGE_KEY = "lanima:caderno:ferramentas";
const TOOLS: readonly Tool[] = ["caneta", "lapis", "marca_texto", "borracha", "laco", "texto"];

const DEFAULTS: ToolState = {
  tool: "caneta",
  penTool: "caneta",
  colors: { caneta: "grafite", lapis: "grafite", marca_texto: "amarelo" },
  sizes: { caneta: 1, lapis: 1, marca_texto: 1 },
  eraser: "traco",
  fingerDraws: null,
};

function load(): ToolState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<ToolState> | null;
    if (!saved) return DEFAULTS;
    return {
      ...DEFAULTS,
      ...saved,
      tool: saved.tool && TOOLS.includes(saved.tool) ? saved.tool : DEFAULTS.tool,
      eraser: saved.eraser === "area" ? "area" : "traco",
      colors: { ...DEFAULTS.colors, ...saved.colors },
      sizes: { ...DEFAULTS.sizes, ...saved.sizes },
    };
  } catch {
    return DEFAULTS;
  }
}

export const useTools = create<ToolState & { loaded: boolean }>(() => ({ ...DEFAULTS, loaded: false }));

/** Reads the saved choice once on the device (not during server rendering). */
export function loadTools() {
  if (useTools.getState().loaded) return;
  useTools.setState({ ...load(), loaded: true });
}

function save(patch: Partial<ToolState>) {
  useTools.setState(patch);
  try {
    const { tool, penTool, colors, sizes, eraser, fingerDraws } = useTools.getState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tool, penTool, colors, sizes, eraser, fingerDraws }));
  } catch {
    // Storage blocked: the choice lasts for this visit.
  }
}

/** The writing tool whose color and thickness the toolbar shows (the last one, for the others). */
export function inkToolOf(state: Pick<ToolState, "tool" | "penTool">): InkTool {
  return isInkTool(state.tool) ? state.tool : state.penTool;
}

export function pickTool(tool: Tool) {
  save(tool === "caneta" || tool === "lapis" ? { tool, penTool: tool } : { tool });
}

export function pickColor(color: InkColor) {
  const state = useTools.getState();
  const tool: InkTool = (MARKER_COLORS as readonly InkColor[]).includes(color)
    ? "marca_texto"
    : state.tool === "lapis"
      ? "lapis"
      : state.tool === "caneta"
        ? "caneta"
        : state.penTool;
  save({ tool, colors: { ...state.colors, [tool]: color }, ...(tool !== "marca_texto" ? { penTool: tool } : {}) });
}

export function pickSize(size: SizeLevel) {
  const state = useTools.getState();
  save({ sizes: { ...state.sizes, [inkToolOf(state)]: size } });
}

export function pickEraser(mode: EraserMode) {
  save({ tool: "borracha", eraser: mode });
}

export function setFingerDraws(on: boolean) {
  save({ fingerDraws: on });
}

/**
 * Phones have no pen: the finger draws unless she turned it off. A phone is a screen whose short
 * side is under 600 px, either way it is held (a Galaxy Tab upright is 640, an iPad 744+).
 */
export function fingerDrawsNow(): boolean {
  const chosen = useTools.getState().fingerDraws;
  if (chosen !== null) return chosen;
  return typeof window !== "undefined" && Math.min(window.screen.width, window.screen.height) < 600;
}
