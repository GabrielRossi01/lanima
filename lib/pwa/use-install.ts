"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getInstallMode, type InstallMode } from "./platform";

/** Chromium-only event, not in lib.dom. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface Window {
    __lanimaInstallEvent?: BeforeInstallPromptEvent | null;
  }
  interface Navigator {
    standalone?: boolean;
  }
}

const INSTALL_EVENT = "lanima:installavailable";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  window.addEventListener(INSTALL_EVENT, onChange);
  mq.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(INSTALL_EVENT, onChange);
    mq.removeEventListener("change", onChange);
  };
}

function snapshot(): InstallMode {
  return getInstallMode(
    { userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0 },
    {
      displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
      navigatorStandalone: navigator.standalone,
    },
    Boolean(window.__lanimaInstallEvent),
  );
}

/** Install state. `null` during SSR and before hydration. */
export function useInstall() {
  const mode = useSyncExternalStore<InstallMode | null>(subscribe, snapshot, () => null);

  const promptInstall = useCallback(async () => {
    const event = window.__lanimaInstallEvent;
    if (!event) return "unavailable" as const;
    await event.prompt();
    const { outcome } = await event.userChoice;
    // A deferred prompt can only be used once.
    window.__lanimaInstallEvent = null;
    window.dispatchEvent(new Event(INSTALL_EVENT));
    return outcome;
  }, []);

  return { mode, promptInstall };
}
