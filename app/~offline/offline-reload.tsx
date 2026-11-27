"use client";

import { useEffect } from "react";

/**
 * The fallback page is served at the address she opened: when the network comes back, reloading
 * shows the real page. (The rest of the app doesn't reload on "online": see app/layout.tsx.)
 */
export function OfflineReload() {
  useEffect(() => {
    const reload = () => window.location.reload();
    window.addEventListener("online", reload);
    return () => window.removeEventListener("online", reload);
  }, []);
  return null;
}
