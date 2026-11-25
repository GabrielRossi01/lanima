"use client";

import { useEffect, useState } from "react";

/** /foco?fps=1: frames per second, to check smoothness on a real device. */
export function FpsMeter({ reduced }: { reduced: boolean }) {
  const [fps, setFps] = useState<number>();
  useEffect(() => {
    let frames = 0;
    let since = performance.now();
    let id = requestAnimationFrame(function frame(now) {
      frames++;
      if (now - since >= 1000) {
        setFps(Math.round((frames * 1000) / (now - since)));
        frames = 0;
        since = now;
      }
      id = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="pointer-events-none absolute top-20 left-4 z-20 rounded-md bg-black/60 px-2 py-1 text-xs text-white tabular-nums">
      {fps ?? "…"} fps · {reduced ? "metade das partículas" : "todas as partículas"}
    </div>
  );
}
