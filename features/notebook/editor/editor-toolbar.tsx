"use client";

import {
  Eraser,
  Highlighter,
  ImagePlus,
  Lasso,
  MoreHorizontal,
  Pen,
  Pencil,
  Redo2,
  Type,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { inkColor, type InkTheme } from "@/lib/ink/render";
import type { InkColor } from "@/lib/ink/strokes";
import {
  inkToolOf,
  loadTools,
  MARKER_COLORS,
  PEN_COLORS,
  pickColor,
  pickEraser,
  pickSize,
  pickTool,
  useTools,
  type EraserMode,
  type SizeLevel,
  type Tool,
} from "./tool-store";

const MAIN_TOOLS: { tool: Tool; label: string; icon: LucideIcon }[] = [
  { tool: "caneta", label: "Caneta", icon: Pen },
  { tool: "lapis", label: "Lápis", icon: Pencil },
  { tool: "marca_texto", label: "Marca-texto", icon: Highlighter },
  { tool: "borracha", label: "Borracha", icon: Eraser },
];
/** On phones these three wait under "Mais ferramentas". */
const MORE_TOOLS: { tool: Tool; label: string; icon: LucideIcon }[] = [
  { tool: "laco", label: "Laço: selecionar, mover e apagar", icon: Lasso },
  { tool: "texto", label: "Caixa de texto", icon: Type },
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

const ERASERS: { mode: EraserMode; label: string }[] = [
  { mode: "traco", label: "Traço inteiro" },
  { mode: "area", label: "Por área" },
];

const round = "flex size-11 shrink-0 items-center justify-center rounded-full";

type Menu = "cores" | "espessura" | "mais" | null;

interface EditorToolbarProps {
  theme: InkTheme;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onInsertImage: () => void;
}

export function UndoRedo({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  className,
}: Pick<EditorToolbarProps, "canUndo" | "canRedo" | "onUndo" | "onRedo"> & { className?: string }) {
  return (
    <div className={cn("items-center gap-1.5", className)}>
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
  );
}

/**
 * The floating toolbar centered over the page (Caderno.html). Swatches show the color as it is
 * drawn in this theme (grafite is white on the dark page). Narrower screens fold the swatches into
 * "Cores"; phones also fold lasso, text and picture into "Mais ferramentas" (undo and redo go to
 * the bottom of the screen there).
 */
export function EditorToolbar({ theme, canUndo, canRedo, onUndo, onRedo, onInsertImage }: EditorToolbarProps) {
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

  const ink = inkToolOf(tools);
  const level = tools.sizes[ink];
  const current = tools.colors[ink];
  const currentSwatch = SWATCHES.find((s) => s.color === current) ?? SWATCHES[0];
  const hex = (s: (typeof SWATCHES)[number]) => inkColor(s.color, s.marker ? "marca_texto" : "caneta", theme);
  const toggle = (which: Exclude<Menu, null>) => setMenu((open) => (open === which ? null : which));
  const erasing = tools.tool === "borracha";
  const moreTool = MORE_TOOLS.find((t) => t.tool === tools.tool);

  const toolButton = ({ tool, label, icon: Icon }: (typeof MAIN_TOOLS)[number], className?: string) => (
    <button
      key={tool}
      type="button"
      aria-label={label}
      aria-pressed={tools.tool === tool}
      onClick={() => {
        pickTool(tool);
        setMenu(null);
      }}
      className={cn(round, tools.tool === tool ? "bg-active text-fg" : "text-fg-2 hover:bg-surface-alt", className)}
    >
      <Icon aria-hidden size={22} strokeWidth={1.75} />
    </button>
  );

  const imageButton = (className?: string) => (
    <button
      type="button"
      aria-label="Inserir imagem ou foto"
      onClick={() => {
        setMenu(null);
        onInsertImage();
      }}
      className={cn(round, "text-fg-2 hover:bg-surface-alt", className)}
    >
      <ImagePlus aria-hidden size={22} strokeWidth={1.75} />
    </button>
  );

  const swatch = (s: (typeof SWATCHES)[number]) => {
    const on = !erasing && current === s.color;
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

  const popover = (label: string, role: "group" | "radiogroup", children: ReactNode) => (
    // Outside the scrolling toolbar: it would be cut off there.
    <div
      ref={menuRef}
      role={role}
      aria-label={label}
      className="pointer-events-auto absolute top-16 flex gap-1 rounded-card border border-line bg-surface p-1.5 shadow-float"
    >
      {children}
    </div>
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-2">
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="Ferramentas de escrita"
        className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-line bg-surface px-1.5 py-1.5 shadow-float [scrollbar-width:none] md:gap-1.5 md:px-2.5"
      >
        {MAIN_TOOLS.map((t) => toolButton(t))}
        {MORE_TOOLS.map((t) => toolButton(t, "max-md:hidden"))}
        {imageButton("max-md:hidden")}
        <button
          type="button"
          aria-label="Mais ferramentas"
          aria-expanded={menu === "mais"}
          onClick={() => toggle("mais")}
          className={cn(round, "md:hidden", moreTool ? "bg-active text-fg" : "text-fg-2 hover:bg-surface-alt")}
        >
          {moreTool ? (
            <moreTool.icon aria-hidden size={22} strokeWidth={1.75} />
          ) : (
            <MoreHorizontal aria-hidden size={22} strokeWidth={1.75} />
          )}
        </button>

        <span aria-hidden className="mx-0.5 h-7 w-px shrink-0 bg-line md:mx-1.5" />

        <div className="hidden items-center gap-1.5 lg:flex">{SWATCHES.map(swatch)}</div>
        <button
          type="button"
          aria-label={`Cores: ${currentSwatch.label}`}
          aria-expanded={menu === "cores"}
          onClick={() => toggle("cores")}
          className={cn(round, "lg:hidden")}
        >
          <span
            aria-hidden
            className="size-[30px] rounded-full border-2 border-surface shadow-[0_0_0_2px_var(--btn)]"
            style={{ background: hex(currentSwatch) }}
          />
        </button>

        <span aria-hidden className="mx-0.5 h-7 w-px shrink-0 bg-line md:mx-1.5" />

        {erasing ? (
          <button
            type="button"
            aria-label={`Borracha: ${tools.eraser === "area" ? "por área" : "traço inteiro"}`}
            aria-expanded={menu === "espessura"}
            onClick={() => toggle("espessura")}
            className={cn(round, "hover:bg-surface-alt")}
          >
            <span
              aria-hidden
              className={cn(
                "rounded-full border-2 border-fg",
                tools.eraser === "area" ? "size-4 border-dashed" : "size-2.5 bg-fg",
              )}
            />
          </button>
        ) : (
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
        )}

        <UndoRedo canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} className="hidden md:flex" />
      </div>

      {menu === "mais" &&
        popover(
          "Mais ferramentas",
          "group",
          <>
            {MORE_TOOLS.map((t) => toolButton(t))}
            {imageButton()}
          </>,
        )}
      {menu === "cores" && popover("Cores", "group", SWATCHES.map(swatch))}
      {menu === "espessura" &&
        (erasing
          ? popover(
              "Borracha",
              "radiogroup",
              ERASERS.map((e) => (
                <button
                  key={e.mode}
                  type="button"
                  role="radio"
                  aria-checked={tools.eraser === e.mode}
                  onClick={() => {
                    pickEraser(e.mode);
                    setMenu(null);
                  }}
                  className={cn(
                    "flex min-h-11 items-center justify-center rounded-md px-3 text-sm font-semibold",
                    tools.eraser === e.mode ? "bg-active text-fg" : "text-fg-2 hover:bg-surface-alt",
                  )}
                >
                  {e.label}
                </button>
              )),
            )
          : popover(
              "Espessura do traço",
              "radiogroup",
              SIZES.map((s) => (
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
              )),
            ))}
    </div>
  );
}
