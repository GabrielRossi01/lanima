"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { toast } from "@/components/ui/toast";
import { PAPER, type InkTheme } from "@/lib/ink/render";
import { PAGE_HEIGHT, PAGE_WIDTH, STROKE_SIZES, type Stroke } from "@/lib/ink/strokes";
import {
  jsonbTextBytes,
  PAGE_FULL_RATIO,
  PAGE_MAX_BYTES,
  pageBytes,
  type ImageElement,
  type PageBackground,
  type PageElement,
} from "@/lib/notebook/model";
import { addImage, holdPage, updatePage, type LocalPage } from "@/lib/notebook/sync";
import { EditorToolbar, UndoRedo } from "./editor-toolbar";
import { InkEngine, newPageItemId, type EngineState, type PageDoc, type ToolChoice } from "./ink-engine";
import { PageElements } from "./page-elements";
import { ERASER_RADIUS, ERASER_REACH, fingerDrawsNow, isInkTool, useTools } from "./tool-store";

/** Saves this long after the last change (drawing comes in bursts). */
const SAVE_DELAY_MS = 500;
/** Room for the floating toolbar above the page. */
const TOOLBAR_SPACE = 84;
/** The notebook bucket takes pictures up to 5 MB (they are compressed to ~400 KB first). */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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

/** What tells two copies of a page apart (stroke ids are never reused; elements are few). */
const docKey = (doc: { strokes: readonly Stroke[]; elements: readonly PageElement[] }) =>
  `${doc.strokes.map((s) => s.id).join(",")}|${JSON.stringify(doc.elements)}`;

function currentTool(): ToolChoice {
  const s = useTools.getState();
  if (isInkTool(s.tool)) return { tool: s.tool, color: s.colors[s.tool], size: STROKE_SIZES[s.tool][s.sizes[s.tool]] };
  if (s.tool === "borracha") return { tool: "borracha", mode: s.eraser, radius: ERASER_RADIUS, reach: ERASER_REACH };
  return { tool: s.tool };
}

/** The picture's size in pixels, for its place on the page. */
async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

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
  const fileRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<InkEngine | null>(null);
  /** Takes a newer copy of the page (another device), set up with the engine. */
  const adoptRef = useRef<((page: LocalPage) => void) | null>(null);
  const writing = useTools((s) => s.tool === "texto");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [state, setState] = useState<EngineState>({
    canUndo: false,
    canRedo: false,
    strokeCount: page.strokes.length,
    zoom: 100,
    elements: page.elements,
    selection: null,
    moving: null,
  });

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
    let doc: PageDoc = { strokes: initial.strokes, elements: initial.elements };
    let bytes = pageBytes(initial);
    let warned = false;
    let dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      clearTimeout(timer);
      if (!dirty) return;
      dirty = false;
      updatePage(userId, initial.id, { strokes: doc.strokes, elements: doc.elements }, { trusted: true }).catch(() =>
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
      doc,
      theme: latest.current.theme,
      top: TOOLBAR_SPACE,
      fingerDraws: fingerDrawsNow,
      tool: currentTool,
      sideEraser: () => ({ radius: ERASER_RADIUS, reach: ERASER_REACH }),
      canAdd: () => {
        if (bytes < PAGE_MAX_BYTES) return true;
        fullToast("Página cheia");
        return false;
      },
      onState: setState,
      onDoc: (next, added) => {
        doc = next;
        // Counted as each stroke comes (measuring the whole page every time would cost too much).
        bytes = added ? bytes + jsonbTextBytes(added) + 2 : pageBytes(doc);
        if (!warned && bytes >= PAGE_MAX_BYTES * PAGE_FULL_RATIO) {
          warned = true;
          fullToast("Página quase cheia");
        }
        dirty = true;
        clearTimeout(timer);
        timer = setTimeout(save, SAVE_DELAY_MS);
      },
      onTextCreated: setFocusId,
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
      if (e.key === "Delete" || e.key === "Backspace") {
        engine.deleteSelection();
        return;
      }
      if (e.key === "Escape") {
        engine.clearSelection();
        return;
      }
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
    let known = docKey(doc);
    adoptRef.current = (next: LocalPage) => {
      const key = docKey(next);
      if (dirty || key === known) return;
      known = key;
      if (key === docKey(doc)) return;
      doc = { strokes: next.strokes, elements: next.elements };
      bytes = pageBytes(doc);
      engine.replaceDoc(doc);
    };

    // While open, undo may bring a deleted picture back: it is kept until she leaves the page.
    const release = holdPage(userId, initial.id);

    return () => {
      save();
      release();
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

  // Leaving the text tool closes the text box being written in.
  useEffect(() => {
    if (!writing && document.activeElement instanceof HTMLTextAreaElement) document.activeElement.blur();
  }, [writing]);

  const onFocused = useCallback(() => setFocusId(null), []);

  const insertImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    const engine = engineRef.current;
    if (!file || !engine) return;
    try {
      const { compressPhoto } = await import("@/features/files/reader");
      const { blob } = await compressPhoto(file);
      if (blob.size > MAX_IMAGE_BYTES) {
        toast({ title: "Imagem grande demais", description: "Use uma imagem de até 5 MB.", tone: "danger" });
        return;
      }
      const { width, height } = await imageSize(blob);
      const imageId = await addImage(userId, page.id, blob);
      let w = Math.min(480, PAGE_WIDTH - 80);
      let h = (w * height) / Math.max(width, 1);
      if (h > 900) {
        w = (w * 900) / h;
        h = 900;
      }
      const [cx, cy] = engine.visibleCenter();
      const round = (n: number) => Math.round(n * 10) / 10;
      const element: ImageElement = {
        id: newPageItemId(),
        type: "imagem",
        x: round(Math.min(Math.max(cx - w / 2, 20), PAGE_WIDTH - 20 - w)),
        y: round(Math.min(Math.max(cy - h / 2, 20), PAGE_HEIGHT - 20 - h)),
        w: round(w),
        h: round(h),
        imageId,
      };
      engine.addElement(element);
    } catch (failure) {
      toast({
        title: "Não foi possível inserir a imagem",
        description: failure instanceof Error ? failure.message : undefined,
        tone: "danger",
      });
    }
  };

  const selection = state.selection;
  const engine = () => engineRef.current;

  return (
    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-bg">
      <div
        ref={viewportRef}
        data-testid="folha"
        className="touch-canvas absolute inset-0 cursor-crosshair overflow-hidden select-none [-webkit-touch-callout:none]"
      >
        <div
          ref={paperRef}
          data-testid="papel"
          className="pointer-events-none absolute top-0 left-0 origin-top-left rounded-[6px] shadow-[0_1px_2px_rgba(31,42,51,0.06),0_12px_32px_rgba(31,42,51,0.08)]"
          style={paperStyle(page.background, theme)}
        >
          <PageElements
            userId={userId}
            pageId={page.id}
            elements={state.elements}
            writing={writing}
            selected={selection?.elementIds ?? []}
            moving={state.moving}
            focusId={focusId}
            onFocused={onFocused}
            onBegin={(id) => engine()?.beginText(id)}
            onText={(id, text) => engine()?.setText(id, text)}
            onEnd={(id) => engine()?.endText(id)}
          />
        </div>
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

      {selection && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-md border-2 border-dashed border-brand"
            style={{
              left: selection.screen.x,
              top: selection.screen.y,
              width: selection.screen.w,
              height: selection.screen.h,
            }}
          />
          {!state.moving && (
            <div
              role="group"
              aria-label={`Seleção: ${selection.count} ${selection.count === 1 ? "item" : "itens"}`}
              className="absolute flex -translate-x-1/2 items-center rounded-full border border-line bg-surface p-1 shadow-float"
              style={{
                left: Math.max(selection.screen.x + selection.screen.w / 2, 90),
                top: selection.screen.y > 140 ? selection.screen.y - 56 : selection.screen.y + selection.screen.h + 8,
              }}
            >
              <button
                type="button"
                onClick={() => engine()?.deleteSelection()}
                className="flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold text-danger-text hover:bg-surface-alt"
              >
                <Trash2 aria-hidden size={18} strokeWidth={1.75} />
                Apagar seleção
              </button>
            </div>
          )}
        </>
      )}

      <EditorToolbar
        theme={theme}
        canUndo={state.canUndo}
        canRedo={state.canRedo}
        onUndo={() => engine()?.undo()}
        onRedo={() => engine()?.redo()}
        onInsertImage={() => fileRef.current?.click()}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        aria-label="Escolher imagem ou foto"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => void insertImage(e)}
      />

      <div
        role="group"
        aria-label="Zoom"
        className="absolute bottom-[max(12px,env(safe-area-inset-bottom))] left-3 flex items-center gap-0.5 rounded-full border border-line bg-surface p-1 shadow-float"
      >
        <button
          type="button"
          aria-label="Diminuir zoom"
          onClick={() => engine()?.zoomBy(1 / 1.25)}
          className="flex size-11 items-center justify-center rounded-full text-fg hover:bg-surface-alt"
        >
          <Minus aria-hidden size={18} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label={`Zoom ${state.zoom}%: ajustar à largura`}
          onClick={() => engine()?.fit()}
          className="min-h-11 min-w-14 rounded-full px-2 text-sm font-semibold text-fg tabular-nums hover:bg-surface-alt"
        >
          {state.zoom}%
        </button>
        <button
          type="button"
          aria-label="Aumentar zoom"
          onClick={() => engine()?.zoomBy(1.25)}
          className="flex size-11 items-center justify-center rounded-full text-fg hover:bg-surface-alt"
        >
          <Plus aria-hidden size={18} strokeWidth={1.75} />
        </button>
      </div>
      {/* On phones undo and redo live here, by the thumb (the toolbar has no room for them). */}
      <UndoRedo
        canUndo={state.canUndo}
        canRedo={state.canRedo}
        onUndo={() => engine()?.undo()}
        onRedo={() => engine()?.redo()}
        className="absolute right-3 bottom-[max(12px,env(safe-area-inset-bottom))] flex rounded-full border border-line bg-surface p-1 shadow-float md:hidden"
      />
    </div>
  );
}
