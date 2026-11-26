"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-provider";
import { summaryContentSchema, type Detail, type SummaryContent } from "@/lib/ai/schemas";
import { getSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { DataError, friendlyError } from "@/lib/supabase/errors";
import { pendingEdits, queueEdit, sendEdits, setSaveState, withPendingEdits } from "./summary-sync";

type Tables = Database["public"]["Tables"];
type SummaryRow = Tables["summaries"]["Row"];

export interface Summary extends Omit<SummaryRow, "content" | "detail"> {
  content: SummaryContent;
  detail: Detail;
}

export const summariesKey = (userId: string | undefined) => ["summaries", userId] as const;
export const remainingKey = (userId: string | undefined) => ["ai-remaining", userId] as const;

function check<T>(result: { data: T | null; error: { message: string; code?: string } | null; status: number }) {
  if (result.error) throw new DataError(result.error.message, { status: result.status, code: result.error.code });
  return result.data as NonNullable<T>;
}

function useUserId() {
  return useAuth().user?.id;
}

/** A summary whose content no longer passes the format is shown as empty, never as a crash. */
function toSummary(row: SummaryRow): Summary {
  const parsed = summaryContentSchema.safeParse(row.content);
  const content: SummaryContent = parsed.success
    ? parsed.data
    : { titulo: row.title, topicos: [], termosChave: [], pontosDeAtencao: [] };
  return { ...row, content, detail: row.detail as Detail };
}

const CONFLICT_MESSAGE = {
  title: "Este resumo mudou em outro aparelho",
  description: "Mostramos a versão mais recente. A sua última alteração não foi salva.",
};

/**
 * Her summaries, newest first, with her edits not sent yet on top (section 6); kept on the device
 * so they open offline. Opening the list also sends what is waiting.
 */
export function useSummaries() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: summariesKey(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const rows = check(
        await getSupabase().from("summaries").select("*").order("created_at", { ascending: false }),
      ).map(toSummary);
      const { rows: merged, conflicts } = await withPendingEdits(userId!, rows);
      if (conflicts.length > 0) toast({ ...CONFLICT_MESSAGE, tone: "danger" });
      return merged;
    },
  });

  // Edits made offline go when the list opens and when the network comes back.
  useEffect(() => {
    if (!userId) return;
    const flush = async () => {
      if (queryClient.isMutating({ mutationKey: SAVE_SUMMARY }) > 0) return;
      const waiting = await pendingEdits(userId);
      if (waiting.length === 0) return;
      let conflict = false;
      for (const { summaryId } of waiting) {
        setSaveState(summaryId, "salvando");
        const result = await sendEdits(userId, summaryId);
        setSaveState(summaryId, result.kind === "offline" ? "offline" : "salvo");
        if (result.kind === "conflict") conflict = true;
      }
      if (conflict) toast({ ...CONFLICT_MESSAGE, tone: "danger" });
      void queryClient.invalidateQueries({ queryKey: summariesKey(userId) });
    };
    void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [userId, queryClient]);

  return query;
}

export function useSummary(id: string) {
  const summaries = useSummaries();
  return { ...summaries, data: summaries.data?.find((s) => s.id === id) };
}

export const SAVE_SUMMARY = ["save-summary"] as const;

class SaveError extends Error {
  constructor(readonly conflict: boolean) {
    super(conflict ? "conflito de versão" : "não salvou");
  }
}

/**
 * Saves her edits; the summary is marked as edited by her (a new generation then asks first).
 *
 * Each edit is a change applied to the newest content right away (on screen and in the outbox of
 * summary-sync.ts). The saves run one at a time (same `scope`: TanStack runs onMutate at once and
 * holds only the request), each sending everything so far on the version it was made on. The server
 * copy is read again only when the last save is done, so it can't bring back an older version.
 * A failure never undoes later edits: the summary is read again and she is told.
 */
export function useSaveSummaryContent() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const key = summariesKey(userId);
  return useMutation({
    mutationKey: SAVE_SUMMARY,
    scope: { id: "summary-content" },
    // Offline is handled by the outbox, not by pausing: the edit is already on the device.
    networkMode: "always",
    onMutate: async ({ id, change }: { id: string; change: (content: SummaryContent) => SummaryContent }) => {
      // Synchronously, before any await: two quick edits each start from the one before.
      void queryClient.cancelQueries({ queryKey: key });
      const summary = queryClient.getQueryData<Summary[]>(key)?.find((s) => s.id === id);
      if (!summary || !userId) return;
      const content = change(summary.content);
      queryClient.setQueryData<Summary[]>(key, (list) =>
        list?.map((s) => (s.id === id ? { ...s, content, title: content.titulo, edited_by_user: true } : s)),
      );
      setSaveState(id, "salvando");
      await queueEdit(userId, id, content, summary.version);
    },
    mutationFn: async ({ id }) => {
      const result = await sendEdits(userId!, id);
      if (result.kind === "conflict") throw new SaveError(true);
      if (result.kind === "failed") throw new SaveError(false);
      if (result.kind === "sent") {
        queryClient.setQueryData<Summary[]>(key, (list) =>
          list?.map((s) => (s.id === id ? { ...s, version: result.version } : s)),
        );
      }
      return result;
    },
    onSuccess: (result, { id }) => {
      if (result.kind === "offline") setSaveState(id, "offline");
      // "Salvo" only when the queue is empty, not between two saves of it.
      else if (queryClient.isMutating({ mutationKey: SAVE_SUMMARY }) <= 1) setSaveState(id, "salvo");
    },
    onError: (error, { id }) => {
      setSaveState(id, "salvo");
      toast(
        error instanceof SaveError && error.conflict
          ? { ...CONFLICT_MESSAGE, tone: "danger" }
          : { title: "Não foi possível salvar a última alteração", description: friendlyError(error), tone: "danger" },
      );
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onSettled: (result) => {
      // Last save of the queue, and it reached the server: read the server copy again.
      if (result?.kind === "offline") return;
      if (queryClient.isMutating({ mutationKey: SAVE_SUMMARY }) === 1)
        void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useDeleteSummary() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const key = summariesKey(userId);
  return useMutation({
    mutationFn: async (id: string) => check(await getSupabase().from("summaries").delete().eq("id", id).select("id")),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Summary[]>(key);
      if (previous)
        queryClient.setQueryData<Summary[]>(
          key,
          previous.filter((s) => s.id !== id),
        );
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export interface Remaining {
  summaries: number;
  questionRuns: number;
  appOpen: boolean;
}

/** "Restam N gerações hoje" (section 7.12). */
export function useAiRemaining() {
  const userId = useUserId();
  return useQuery({
    queryKey: remainingKey(userId),
    enabled: Boolean(userId),
    staleTime: 30_000,
    queryFn: async (): Promise<Remaining> => {
      const rows = check(await getSupabase().rpc("ai_remaining"));
      const row = rows[0];
      return { summaries: row?.summaries ?? 0, questionRuns: row?.question_runs ?? 0, appOpen: row?.app_open ?? false };
    },
  });
}
