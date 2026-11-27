"use client";

import { useQuery } from "@tanstack/react-query";
import { ImageIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import type { ImageElement, PageElement, TextElement } from "@/lib/notebook/model";
import { loadImage } from "@/lib/notebook/sync";
import { notebookKey } from "../queries";

/**
 * Text boxes and pictures on the page (section 7.2), in page units: they sit on the paper, which
 * the camera scales, so they zoom and scroll with it. Text boxes take presses only while the
 * "Caixa de texto" tool is on; otherwise the pen writes over them.
 */

interface PageElementsProps {
  userId: string;
  pageId: string;
  elements: readonly PageElement[];
  /** The text tool is on: text boxes can be written in. */
  writing: boolean;
  selected: readonly string[];
  moving: { dx: number; dy: number } | null;
  /** A new text box to put the cursor in. */
  focusId: string | null;
  onFocused: () => void;
  onBegin: (id: string) => void;
  onText: (id: string, text: string) => void;
  onEnd: (id: string) => void;
}

export function PageElements(props: PageElementsProps) {
  const { elements, selected, moving } = props;
  return (
    <>
      {elements.map((element) => {
        const offset = moving && selected.includes(element.id) ? moving : null;
        return element.type === "texto" ? (
          <TextBox key={element.id} element={element} offset={offset} {...props} />
        ) : (
          <ImageBox key={element.id} element={element} offset={offset} userId={props.userId} pageId={props.pageId} />
        );
      })}
    </>
  );
}

function TextBox({
  element,
  offset,
  writing,
  focusId,
  onFocused,
  onBegin,
  onText,
  onEnd,
}: PageElementsProps & { element: TextElement; offset: { dx: number; dy: number } | null }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grows with its text (a textarea doesn't by itself everywhere).
  useLayoutEffect(() => {
    const area = ref.current;
    if (!area) return;
    area.style.height = "0px";
    area.style.height = `${area.scrollHeight}px`;
  }, [element.text, element.w, element.size]);

  useEffect(() => {
    if (focusId !== element.id) return;
    ref.current?.focus();
    onFocused();
  }, [focusId, element.id, onFocused]);

  return (
    <textarea
      ref={ref}
      aria-label="Caixa de texto"
      data-elemento-ativo={writing ? "" : undefined}
      value={element.text}
      readOnly={!writing}
      tabIndex={writing ? 0 : -1}
      rows={1}
      spellCheck
      onFocus={() => onBegin(element.id)}
      onChange={(e) => onText(element.id, e.target.value)}
      onBlur={() => onEnd(element.id)}
      className={cn(
        "absolute m-0 resize-none overflow-hidden border-0 bg-transparent p-0 font-sans text-fg",
        writing
          ? "pointer-events-auto rounded-sm outline-1 outline-line-strong outline-dashed focus:outline-2 focus:outline-brand focus:outline-solid"
          : "pointer-events-none outline-none",
      )}
      style={{
        left: element.x,
        top: element.y,
        width: element.w,
        fontSize: element.size,
        lineHeight: 1.35,
        transform: offset ? `translate(${offset.dx}px, ${offset.dy}px)` : undefined,
      }}
    />
  );
}

/** A picture's file, from the device or downloaded once (then kept for offline). */
function useImageUrl(userId: string, pageId: string, imageId: string) {
  // One blob URL per picture for the whole visit (kept with the query; freed when the app closes).
  const image = useQuery({
    queryKey: notebookKey(userId, "imagem", imageId),
    networkMode: "always",
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const blob = await loadImage(userId, pageId, imageId);
      return blob instanceof Blob ? URL.createObjectURL(blob) : null;
    },
  });
  return image.data ?? null;
}

function ImageBox({
  element,
  offset,
  userId,
  pageId,
}: {
  element: ImageElement;
  offset: { dx: number; dy: number } | null;
  userId: string;
  pageId: string;
}) {
  const url = useImageUrl(userId, pageId, element.imageId);
  const style = {
    left: element.x,
    top: element.y,
    width: element.w,
    height: element.h,
    transform: offset ? `translate(${offset.dx}px, ${offset.dy}px)` : undefined,
  };
  if (!url) {
    return (
      <div
        role="img"
        aria-label="Imagem colada (ainda não chegou a este aparelho)"
        className="pointer-events-none absolute flex flex-col items-center justify-center gap-2 rounded-md border border-line bg-surface-alt text-[20px] text-fg-2"
        style={style}
      >
        <ImageIcon aria-hidden size={40} strokeWidth={1.5} />
        Imagem colada
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a picture from the device (blob URL), not an optimizable asset
    <img
      src={url}
      alt="Imagem colada"
      draggable={false}
      className="pointer-events-none absolute rounded-md object-cover select-none"
      style={style}
    />
  );
}
