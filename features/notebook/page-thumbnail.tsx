"use client";

import { useEffect, useRef, useState } from "react";
import { drawPage, PAPER } from "@/lib/ink/render";
import { PAGE_HEIGHT, PAGE_WIDTH } from "@/lib/ink/strokes";
import { cn } from "@/lib/cn";
import { useTheme } from "@/lib/theme/use-theme";
import { usePage } from "./queries";

interface PageThumbnailProps {
  pageId: string | undefined;
  /** CSS px; the height follows the A4 page. */
  width: number;
  className?: string;
}

/**
 * A page drawn small from its real strokes, in the current theme. Read and drawn only once it is
 * near the screen: a long list doesn't load every page.
 */
export function PageThumbnail({ pageId, width, className }: PageThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const page = usePage(visible ? pageId : null);
  const { resolved } = useTheme();
  const height = Math.round((width * PAGE_HEIGHT) / PAGE_WIDTH);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const data = page.data;
    if (!canvas || !data || !resolved) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawPage(ctx, data, resolved, width, ratio);
  }, [page.data, resolved, width, height]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-testid="miniatura"
      style={{ width, height, background: PAPER[resolved ?? "light"].page }}
      className={cn("block shrink-0 rounded-[4px] shadow-[0_1px_3px_rgba(31,42,51,0.14)]", className)}
    />
  );
}
