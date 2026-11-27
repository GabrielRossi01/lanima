"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-provider";
import { countPending, onNotebookChange, syncNotebooks } from "@/lib/notebook/sync";
import { notebookKey, useNotebookSaveState } from "./queries";

/** Her change waits this long for the next one before going (a page is drawn in bursts). */
const SEND_DELAY_MS = 1500;
/**
 * A send that failed while the device says it is online (the network was just coming back, a
 * blip, a server error) is tried again after these waits, then every minute. A send that works
 * starts the list over.
 */
const RETRY_MS = [2000, 4000, 8000, 16_000, 30_000, 60_000];

/**
 * Sends the notebook in the background, anywhere in the app (section 6): after her changes, when
 * the network comes back, when she leaves the app; and reads other devices' changes when she comes
 * back to it. Mounted once in each signed-in layout.
 */
export function NotebookSyncWatcher() {
  const userId = useAuth().user?.id;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    useNotebookSaveState.setState({ heard: false });
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const showWaiting = async () => {
      const unsent = await countPending(userId);
      if (stopped) return;
      useNotebookSaveState.setState({
        unsent,
        state: unsent === 0 ? "salvo" : navigator.onLine ? "salvando" : "offline",
      });
    };

    const run = async () => {
      clearTimeout(timer);
      await showWaiting();
      if (!navigator.onLine || stopped) return;
      const result = await syncNotebooks(userId);
      if (stopped) return;
      const unsent = await countPending(userId);
      useNotebookSaveState.setState((s) => ({
        heard: s.heard || result.status !== "offline",
        unsent,
        state:
          unsent === 0
            ? "salvo"
            : result.status === "failed"
              ? "erro"
              : result.status === "ok"
                ? "salvando"
                : "offline",
      }));
      clearTimeout(retry);
      if (result.status === "ok") failures = 0;
      // Offline for real: the "online" event brings the next try.
      if (unsent > 0 && (result.status !== "offline" || navigator.onLine)) {
        const wait = result.status === "ok" ? RETRY_MS.at(-1)! : RETRY_MS[Math.min(failures++, RETRY_MS.length - 1)];
        retry = setTimeout(() => void run(), wait);
      }
      void queryClient.invalidateQueries({ queryKey: notebookKey(userId) });
      if (result.overwritten > 0)
        toast({
          title: "Página atualizada por outro aparelho",
          description: "Ela foi alterada depois em outro aparelho; ficou a versão mais recente.",
        });
      if (result.refused > 0)
        toast({
          title: "Página cheia demais para sincronizar",
          description: "Ela ficou só neste aparelho. Continue numa nova página.",
          tone: "danger",
        });
      if (result.quotaFull)
        toast({
          title: "Seu espaço de 250 MB acabou",
          description: "A imagem ficou só neste aparelho. Libere espaço em Arquivos.",
          tone: "danger",
        });
    };

    const unsubscribe = onNotebookChange((who, source) => {
      if (who !== userId) return;
      void queryClient.invalidateQueries({ queryKey: notebookKey(userId) });
      if (source !== "local") return;
      void showWaiting();
      clearTimeout(timer);
      timer = setTimeout(() => void run(), SEND_DELAY_MS);
    });
    const onOnline = () => void run();
    const onOffline = () => void showWaiting();
    // Leaving the app: send now. Coming back: read what other devices changed.
    const onVisibility = () => void run();

    void run();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(retry);
      unsubscribe();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [userId, queryClient]);

  return null;
}
