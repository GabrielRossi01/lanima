"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { toast } from "@/components/ui/toast";
import { PAPER, type InkTheme } from "@/lib/ink/render";
import { PAGE_HEIGHT, PAGE_WIDTH, STROKE_SIZES, type Stroke } from "@/lib/ink/strokes";
import { jsonbTextBytes, PAGE_FULL_RATIO, PAGE_MAX_BYTES, pageBytes, type PageBackground } from "@/lib/notebook/model";
import { updatePage, type LocalPage } from "@/lib/notebook/sync";
import { InkEngine, type EngineState } from "./ink-engine";
import { EditorToolbar } from "./editor-toolbar";
import { fingerDrawsNow, useTools } from "./tool-store";

/** Saves this long after the last stroke (drawing comes in bursts). */
const SAVE_DELAY_MS = 500;
/** Room for the floating toolbar above the page. */
const TOOLBAR_SPACE = 84;

function paperStyle(background: PageBackground, theme: InkTheme): CSSProperties {
  const paper = PAPER[theme];
  const base: CSSProperties = {
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    backgroundColor: paper.page,
  };
  if (background === "pontilhado") {
    return {
      ...base,
      backgroundImage: `radial-gradient(circle, ${paper.dot} 1.8px, transparent 2.2px)`,
      backgroundSize: "25px 25px",
      backgroundPosition: "12.5px 12.5px",
    };
  }
  if (background === "pautado") {
    return {
      ...base,
      backgroundImage: `linear-gradient(to bottom, ${paper.rule} 0 1.5px, transparent 1.5px)`,
      backgroundSize: "920px 32px",
      backgroundPosition: "40px 110px",
      backgroundRepeat: "repeat-y",
    };
  }
  return base;
}

const idsOf = (strokes: readonly Stroke[]) => strokes.map((s) => s.id).join(",");

interface PageEditorProps {
  page: LocalPage;
  userId: string;
  theme: InkTheme;
  pageNumber: number;
  /** "Página cheia": continue on a new page. */
  onAddPage: () => void;
}

/** One notebook page to write on (section 7.2): see ink-engine.ts for how it draws. */
export function PageEditor({ page, userId, theme, pageNumber, onAddPage }: PageEditorProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<InkEngine | null>(null);
  /** Takes a newer copy of the page (another device), set up with the engine. */
  const adoptRef = useRef<((page: LocalPage) => void) | null>(null);
  const [state, setState] = useState<EngineState>({ canUndo: false, canRedo: false, strokeCount: 0, zoom: 100 });

  // Kept in refs: the engine reads them while drawing, without remounting.
  const latest = useRef({ page, theme, onAddPage });
  useEffect(() => {
    latest.current = { page, theme, onAddPage };
  });

  useEffect(() => {
    const viewport = viewportRef.current;
    const paper = paperRef.current;
    const marker = markerRef.current;
    const ink = inkRef.current;
    const live = liveRef.current;
    if (!viewport || !paper || !marker || !ink || !live) return;

    const initial = latest.current.page;
    let strokes = initial.strokes;
    let bytes = pageBytes(initial);
    let warned = false;
    let dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      clearTimeout(timer);
      if (!dirty) return;
      dirty = false;
      updatePage(userId, initial.id, { strokes }, { trusted: true }).catch(() =>
        toast({ title: "Não foi possível salvar a página neste aparelho", tone: "danger" }),
      );
    };

    const fullToast = (title: string) =>
      toast({
        title,
        description: "Continue numa nova página.",
        actions: [{ label: "Nova página", onClick: () => latest.current.onAddPage() }],
      });

    const engine = new InkEngine({
      viewport,
      paper,
      marker,
      ink,
      live,
      strokes,
      theme: latest.current.theme,
      top: TOOLBAR_SPACE,
      fingerDraws: fingerDrawsNow,
      pen: () => {
        const { tool, colors, sizes } = useTools.getState();
        return { tool, color: colors[tool], size: STROKE_SIZES[tool][sizes[tool]] };
      },
      canAdd: () => {
        if (bytes < PAGE_MAX_BYTES) return true;
        fullToast("Página cheia");
        return false;
      },
      onState: setState,
      onStrokes: (next, added) => {
        strokes = next;
        // Counted as each stroke comes (measuring the whole page every time would cost too much).
        bytes = added
          ? bytes + jsonbTextBytes(added) + 2
          : pageBytes({ strokes, elements: latest.current.page.elements });
        if (!warned && bytes >= PAGE_MAX_BYTES * PAGE_FULL_RATIO) {
          warned = true;
          fullToast("Página quase cheia");
        }
        dirty = true;
        clearTimeout(timer);
        timer = setTimeout(save, SAVE_DELAY_MS);
      },
    });
    engineRef.current = engine;

    // Leaving the app or the page: what waits is saved now.
    const onHide = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", save);
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) engine.undo();
      else if ((key === "z" && e.shiftKey) || key === "y") engine.redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);

    // Changes from another device arrive here while the page is open: taken when nothing of hers
    // waits to be saved (the newest change wins, as on the server).
    let known = idsOf(strokes);
    const adopt = (next: LocalPage) => {
      const ids = idsOf(next.strokes);
      if (dirty || ids === known) return;
      known = ids;
      if (ids === idsOf(strokes)) return;
      strokes = next.strokes;
      bytes = pageBytes(next);
      engine.replaceStrokes(next.strokes);
    };
    adoptRef.current = adopt;

    return () => {
      save();
      engine.destroy();
      engineRef.current = null;
      adoptRef.current = null;
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", save);
      window.removeEventListener("keydown", onKey);
    };
    // Mounted once per page (the screen keys this component by page id).
  }, [userId]);

  useEffect(() => {
    adoptRef.current?.(page);
  }, [page]);

  useEffect(() => {
    engineRef.current?.setTheme(theme);
  }, [theme]);

  return (
    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-bg">
      <div
        ref={viewportRef}
        data-testid="folha"
        className="touch-canvas absolute inset-0 cursor-crosshair overflow-hidden select-none [-webkit-touch-callout:none]"
      >
        <div
          ref={paperRef}
          aria-hidden
          data-testid="papel"
          className="pointer-events-none absolute top-0 left-0 origin-top-left rounded-[6px] shadow-[0_1px_2px_rgba(31,42,51,0.06),0_12px_32px_rgba(31,42,51,0.08)]"
          style={paperStyle(page.background, theme)}
        />
        <canvas
          ref={markerRef}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 origin-top-left"
          style={{ mixBlendMode: theme === "light" ? "multiply" : "normal" }}
        />
        <canvas
          ref={inkRef}
          role="img"
          aria-label={`Página ${pageNumber}: ${state.strokeCount} ${state.strokeCount === 1 ? "traço" : "traços"}`}
          className="pointer-events-none absolute top-0 left-0 origin-top-left"
        />
        <canvas ref={liveRef} aria-hidden className="pointer-events-none absolute top-0 left-0" />
      </div>

      <EditorToolbar
        theme={theme}
        canUndo={state.canUndo}
        canRedo={state.canRedo}
        onUndo={() => engineRef.current?.undo()}
        onRedo={() => engineRef.current?.redo()}
      />

      <div
        role="group"
        aria-label="Zoom"
        className="absolute bottom-[max(12px,env(safe-area-inset-bottom))] left-3 flex items-center gap-0.5 rounded-full border border-line bg-surface p-1 shadow-float"
      >
        <button
          type="button"
          aria-label="Diminuir zoom"
          onClick={() => engineRef.current?.zoomBy(1 / 1.25)}
          className="flex size-11 items-center justify-center rounded-full text-fg hover:bg-surface-alt"
        >
          <Minus aria-hidden size={18} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label={`Zoom ${state.zoom}%: ajustar à largura`}
          onClick={() => engineRef.current?.fit()}
          className="min-h-11 min-w-14 rounded-full px-2 text-sm font-semibold text-fg tabular-nums hover:bg-surface-alt"
        >
          {state.zoom}%
        </button>
        <button
          type="button"
          aria-label="Aumentar zoom"
          onClick={() => engineRef.current?.zoomBy(1.25)}
          className="flex size-11 items-center justify-center rounded-full text-fg hover:bg-surface-alt"
        >
          <Plus aria-hidden size={18} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
