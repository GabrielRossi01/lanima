"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  isThemePreference,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme";

declare global {
  interface Window {
    __lanimaApplyTheme?: () => void;
  }
}

function readPreference(): ThemePreference {
  const attr = document.documentElement.getAttribute("data-theme-preference");
  return isThemePreference(attr) ? attr : "system";
}

function readResolved(): ResolvedTheme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-theme-preference"],
  });
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => {
    observer.disconnect();
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  };
}

export function setThemePreference(preference: ThemePreference) {
  try {
    if (preference === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage can be blocked (private mode); the attribute below still applies for this session.
    document.documentElement.setAttribute("data-theme-preference", preference);
  }
  window.__lanimaApplyTheme?.();
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/** Current theme preference and resolved theme. Server snapshot is `null` (unknown until hydration). */
export function useTheme() {
  const preference = useSyncExternalStore(subscribe, readPreference, () => null);
  const resolved = useSyncExternalStore(subscribe, readResolved, () => null);
  const setPreference = useCallback((p: ThemePreference) => setThemePreference(p), []);
  return { preference, resolved, setPreference };
}
