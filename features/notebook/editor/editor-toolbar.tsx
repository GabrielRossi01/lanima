"use client";

import { Highlighter, Pen, Pencil, Redo2, Undo2, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { inkColor, type InkTheme } from "@/lib/ink/render";
import type { InkColor } from "@/lib/ink/strokes";
import {
  loadTools,
  MARKER_COLORS,
  PEN_COLORS,
  pickColor,
  pickSize,
  pickTool,
  useTools,
  type SizeLevel,
  type Tool,
} from "./tool-store";

const TOOLS: { tool: Tool; label: string; icon: LucideIcon }[] = [
  { tool: "caneta", label: "Caneta", icon: Pen },
  { tool: "lapis", label: "Lápis", icon: Pencil },
  { tool: "marca_texto", label: "Marca-texto", icon: Highlighter },
];

const SWATCHES: { color: InkColor; label: string; marker: boolean }[] = [
  { color: PEN_COLORS[0], label: "grafite", marker: false },
  { color: PEN_COLORS[1], label: "azul cimento", marker: false },
  { color: MARKER_COLORS[0], label: "marca-texto amarelo", marker: true },
  { color: MARKER_COLORS[1], label: "marca-texto rosa", marker: true },
  { color: MARKER_COLORS[2], label: "marca-texto verde", marker: true },
];

const SIZES: { level: SizeLevel; label: string; dot: number }[] = [
  { level: 0, label: "Fina", dot: 4 },
  { level: 1, label: "Média", dot: 7 },
  { level: 2, label: "Grossa", dot: 10 },
];

const round = "flex size-11 shrink-0 items-center justify-center rounded-full";

type Menu = "cores" | "espessura" | null;

interface EditorToolbarProps {
  theme: InkTheme;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * The floating toolbar centered over the page (Caderno.html). Swatches show the color as it is
 * drawn in this theme (grafite is white on the dark page). On narrow screens the five swatches
 * fold into one "Cores" button, so undo and redo stay in reach.
 */
export function EditorToolbar({ theme, canUndo, canRedo, onUndo, onRedo }: EditorToolbarProps) {
  const tools = useTools();
  const [menu, setMenu] = useState<Menu>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTools();
  }, []);

  useEffect(() => {
    if (!menu) return;
    // A press outside the toolbar and its menu closes it (React listens on the document too, so
    // stopping the event in the menu wouldn't keep this from running).
    const close = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!toolbarRef.current?.contains(target) && !menuRef.current?.contains(target)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const level = tools.sizes[tools.tool];
  const current = tools.colors[tools.tool];
  const currentSwatch = SWATCHES.find((s) => s.color === current) ?? SWATCHES[0];
  const hex = (s: (typeof SWATCHES)[number]) => inkColor(s.color, s.marker ? "marca_texto" : "caneta", theme);
  const toggle = (which: Exclude<Menu, null>) => setMenu((open) => (open === which ? null : which));

  const swatch = (s: (typeof SWATCHES)[number]) => {
    const on = current === s.color;
    return (
      <button
        key={s.color}
        type="button"
        aria-label={`Cor ${s.label}`}
        aria-pressed={on}
        onClick={() => {
          pickColor(s.color);
          setMenu(null);
        }}
        className="flex size-11 shrink-0 items-center justify-center rounded-full"
      >
        <span
          aria-hidden
          className={cn(
            "size-[30px] rounded-full border-2 border-surface",
            on ? "shadow-[0_0_0_2px_var(--btn)]" : "shadow-[0_0_0_1px_var(--border-strong)]",
          )}
          style={{ background: hex(s) }}
        />
      </button>
    );
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-2">
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="Ferramentas de escrita"
        className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-line bg-surface px-2 py-1.5 shadow-float [scrollbar-width:none] md:gap-1.5 md:px-2.5"
      >
        {TOOLS.map(({ tool, label, icon: Icon }) => (
          <button
            key={tool}
            type="button"
            aria-label={label}
            aria-pressed={tools.tool === tool}
            onClick={() => pickTool(tool)}
            className={cn(round, tools.tool === tool ? "bg-active text-fg" : "text-fg-2 hover:bg-surface-alt")}
          >
            <Icon aria-hidden size={22} strokeWidth={1.75} />
          </button>
        ))}

        <span aria-hidden className="mx-0.5 h-7 w-px shrink-0 bg-line md:mx-1.5" />

        <div className="hidden items-center gap-1.5 md:flex">{SWATCHES.map(swatch)}</div>
        <button
          type="button"
          aria-label={`Cores: ${currentSwatch.label}`}
          aria-expanded={menu === "cores"}
          onClick={() => toggle("cores")}
          className={cn(round, "md:hidden")}
        >
          <span
            aria-hidden
            className="size-[30px] rounded-full border-2 border-surface shadow-[0_0_0_2px_var(--btn)]"
            style={{ background: hex(currentSwatch) }}
          />
        </button>

        <span aria-hidden className="mx-0.5 h-7 w-px shrink-0 bg-line md:mx-1.5" />

        <button
          type="button"
          aria-label={`Espessura do traço: ${SIZES[level].label.toLowerCase()}`}
          aria-expanded={menu === "espessura"}
          onClick={() => toggle("espessura")}
          className={cn(round, "gap-[3px] hover:bg-surface-alt")}
        >
          {SIZES.map((s) => (
            <span
              key={s.level}
              aria-hidden
              className={cn("rounded-full", s.level === level ? "bg-fg" : "bg-line-strong")}
              style={{ width: s.dot, height: s.dot }}
            />
          ))}
        </button>

        <button
          type="button"
          aria-label="Desfazer"
          disabled={!canUndo}
          onClick={onUndo}
          className={cn(round, "border border-line text-fg hover:bg-surface-alt disabled:opacity-40")}
        >
          <Undo2 aria-hidden size={20} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label="Refazer"
          disabled={!canRedo}
          onClick={onRedo}
          className={cn(round, "border border-line text-fg hover:bg-surface-alt disabled:opacity-40")}
        >
          <Redo2 aria-hidden size={20} strokeWidth={1.75} />
        </button>
      </div>

      {/* Menus outside the scrolling toolbar: they would be cut off there. */}
      {menu === "cores" && (
        <div
          ref={menuRef}
          role="group"
          aria-label="Cores"
          className="pointer-events-auto absolute top-16 flex gap-1 rounded-card border border-line bg-surface p-1.5 shadow-float"
        >
          {SWATCHES.map(swatch)}
        </div>
      )}
      {menu === "espessura" && (
        <div
          ref={menuRef}
          role="radiogroup"
          aria-label="Espessura do traço"
          className="pointer-events-auto absolute top-16 flex gap-1 rounded-card border border-line bg-surface p-1.5 shadow-float"
        >
          {SIZES.map((s) => (
            <button
              key={s.level}
              type="button"
              role="radio"
              aria-checked={s.level === level}
              onClick={() => {
                pickSize(s.level);
                setMenu(null);
              }}
              className={cn(
                "flex min-h-11 min-w-16 flex-col items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold",
                s.level === level ? "bg-active text-fg" : "text-fg-2 hover:bg-surface-alt",
              )}
            >
              <span aria-hidden className="rounded-full bg-fg" style={{ width: s.dot + 2, height: s.dot + 2 }} />
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
