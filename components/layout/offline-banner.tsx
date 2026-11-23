"use client";

import { CloudOff } from "lucide-react";
import { useOnline } from "@/lib/hooks/use-online";

/** Discreet notice while offline (section 6): lists come from the copy saved on the device. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="mb-4 inline-flex items-center gap-2 rounded-full bg-surface-alt px-3.5 py-1.5 text-xs font-semibold text-fg-2"
    >
      <CloudOff aria-hidden size={14} strokeWidth={1.75} />
      Offline · mostrando dados salvos no aparelho
    </div>
  );
}
