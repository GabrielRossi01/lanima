"use client";

import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { useAuth } from "@/features/auth/auth-provider";
import { useOnline } from "@/lib/hooks/use-online";
import {
  getPage,
  listNotebooks,
  listPageSummaries,
  type LocalNotebook,
  type LocalPage,
  type PageSummary,
} from "@/lib/notebook/sync";

/**
 * The notebook as the screens see it: read from the device (lib/notebook/sync.ts), which is where
 * it lives first. These queries are not kept in the persisted cache; Dexie is the copy.
 * `NotebookSyncWatcher` refetches them whenever the device's copy changes.
 */

export const notebookKey = (userId: string | undefined, ...rest: unknown[]) => ["notebook", userId, ...rest] as const;

export interface NotebookWithPages extends LocalNotebook {
  pages: PageSummary[];
  /** Newest change of the notebook or any of its pages. */
  lastEditedAt: number;
  /** Something here isn't on the server yet. */
  unsent: boolean;
}

export function useNotebooks() {
  const userId = useAuth().user?.id;
  return useQuery({
    queryKey: notebookKey(userId, "list"),
    enabled: Boolean(userId),
    networkMode: "always",
    queryFn: async (): Promise<NotebookWithPages[]> => {
      const [notebooks, pages] = await Promise.all([listNotebooks(userId!), listPageSummaries(userId!)]);
      return notebooks
        .map((notebook) => {
          const own = pages.filter((p) => p.notebookId === notebook.id);
          return {
            ...notebook,
            pages: own,
            lastEditedAt: Math.max(notebook.editedAt, ...own.map((p) => p.editedAt)),
            unsent: notebook.pending || own.some((p) => p.pending),
          };
        })
        .sort((a, b) => b.lastEditedAt - a.lastEditedAt);
    },
  });
}

/**
 * Her notebooks for a list screen: undefined while loading, and also while the device has none and
 * the server wasn't heard yet (a new device would say "Nenhum caderno" before they arrive).
 */
export function useNotebookList(): NotebookWithPages[] | undefined {
  const notebooks = useNotebooks();
  const heard = useNotebookSaveState((s) => s.heard);
  const online = useOnline();
  if (notebooks.data?.length === 0 && online && !heard) return undefined;
  return notebooks.data;
}

/** One page with its strokes (thumbnails, the editor). */
export function usePage(pageId: string | null | undefined) {
  const userId = useAuth().user?.id;
  return useQuery({
    queryKey: notebookKey(userId, "page", pageId),
    enabled: Boolean(userId && pageId),
    networkMode: "always",
    queryFn: (): Promise<LocalPage | null> => getPage(userId!, pageId!),
  });
}

export type NotebookSaveState = "salvo" | "salvando" | "offline" | "erro";

export const SAVE_STATE_LABELS: Record<NotebookSaveState, string> = {
  salvo: "Salvo",
  salvando: "Salvando…",
  offline: "Offline · será sincronizado",
  erro: "Não sincronizado · tentando de novo",
};

/** "Salvo", "Salvando…" or "Offline · será sincronizado" (section 6), for the whole notebook. */
export const useNotebookSaveState = create<{
  state: NotebookSaveState;
  unsent: number;
  /** The server answered at least once in this visit: an empty list is really empty. */
  heard: boolean;
}>(() => ({
  state: "salvo",
  unsent: 0,
  heard: false,
}));

export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}
