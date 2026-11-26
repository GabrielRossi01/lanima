"use client";

import { create } from "zustand";
import { summaryContentSchema, type SummaryContent } from "@/lib/ai/schemas";
import { readLocal, writeLocal, type SummaryEditRow } from "@/lib/db/local";
import { getSupabase } from "@/lib/supabase/client";

/**
 * Edits of a summary, local-first (section 6): each edit is written on the device first, in one
 * row per summary with the newest content and the server version it was made on, then sent.
 * The send only writes if the server is still at that version, and raises it by one. If the server
 * has a newer version (an edit or a new generation on another device), nothing is overwritten: the
 * edit is dropped and she is told. Offline, the row waits for the network.
 */

export type SaveState = "salvo" | "salvando" | "offline";

/** "Salvo", "Salvando…" or "Offline · será sincronizado", per summary. */
export const useSaveState = create<{ bySummary: Record<string, SaveState> }>(() => ({ bySummary: {} }));

export function setSaveState(summaryId: string, state: SaveState) {
  useSaveState.setState((s) => ({ bySummary: { ...s.bySummary, [summaryId]: state } }));
}

/** Where IndexedDB can't be used, the edits wait here for this visit. */
const memory = new Map<string, SummaryEditRow>();
const memoryKey = (userId: string, summaryId: string) => `${userId}:${summaryId}`;

async function readRow(userId: string, summaryId: string): Promise<SummaryEditRow | undefined> {
  const stored = await readLocal((db) => db.summaryEdits.get([userId, summaryId]));
  return stored ?? memory.get(memoryKey(userId, summaryId));
}

async function writeRow(row: SummaryEditRow): Promise<void> {
  const saved = await writeLocal(row.userId, (db) => db.summaryEdits.put(row));
  if (saved) memory.delete(memoryKey(row.userId, row.summaryId));
  else memory.set(memoryKey(row.userId, row.summaryId), row);
}

async function deleteRow(userId: string, summaryId: string): Promise<void> {
  memory.delete(memoryKey(userId, summaryId));
  await writeLocal(userId, (db) => db.summaryEdits.delete([userId, summaryId]));
}

/** Her edits waiting to be sent, valid ones only (rows may come from an older version of the app). */
export async function pendingEdits(
  userId: string,
): Promise<{ summaryId: string; content: SummaryContent; baseVersion: number }[]> {
  const stored = (await readLocal((db) => db.summaryEdits.where({ userId }).toArray())) ?? [];
  const inMemory = [...memory.values()].filter((r) => r.userId === userId);
  const rows = [...stored, ...inMemory.filter((m) => !stored.some((s) => s.summaryId === m.summaryId))];
  return rows.flatMap((row) => {
    const content = summaryContentSchema.safeParse(row.content);
    return content.success ? [{ summaryId: row.summaryId, content: content.data, baseVersion: row.baseVersion }] : [];
  });
}

export async function countUnsentEdits(userId: string): Promise<number> {
  return (await pendingEdits(userId)).length;
}

// Writes and sends of the same summary never overlap: a chain of promises per summary.
const chains = new Map<string, Promise<unknown>>();
function inOrder<T>(summaryId: string, work: () => Promise<T>): Promise<T> {
  const previous = chains.get(summaryId) ?? Promise.resolve();
  const next = previous.then(work, work);
  chains.set(
    summaryId,
    next.catch(() => {}),
  );
  return next;
}

/**
 * The newest version the server confirmed for each summary in this visit. An edit queued while an
 * earlier send was on its way saw an older version on screen; by the time it is written (in order,
 * after that send), this has the version the send produced.
 */
const confirmed = new Map<string, { version: number; content: SummaryContent | null }>();

/**
 * Notes what the server took. A list read before it landed is older than this: withPendingEdits
 * shows this content instead (TanStack reuses a read already under way rather than reading again).
 */
function confirm(summaryId: string, version: number, content: SummaryContent | null) {
  const known = confirmed.get(summaryId);
  if (known && known.version > version) return;
  confirmed.set(summaryId, { version, content: content ?? (known?.version === version ? known.content : null) });
}

/** Keeps the newest content of an edit; the base version stays the one it was first made on. */
export function queueEdit(userId: string, summaryId: string, content: SummaryContent, versionOnScreen: number) {
  return inOrder(summaryId, async () => {
    const current = await readRow(userId, summaryId);
    await writeRow({
      userId,
      summaryId,
      content,
      baseVersion: current?.baseVersion ?? Math.max(versionOnScreen, confirmed.get(summaryId)?.version ?? 0),
      revision: (current?.revision ?? 0) + 1,
    });
  });
}

export type SendResult =
  | { kind: "sent"; version: number }
  | { kind: "nothing" }
  | { kind: "offline" }
  | { kind: "conflict" }
  | { kind: "failed"; message: string };

const SEND_TIMEOUT_MS = 15_000;

/**
 * Sends what is waiting for one summary. Edits made while sending go in the next round of the
 * loop, on the version the server just took.
 */
export function sendEdits(userId: string, summaryId: string): Promise<SendResult> {
  return inOrder(summaryId, async () => {
    let result: SendResult = { kind: "nothing" };
    for (;;) {
      const row = await readRow(userId, summaryId);
      if (!row) return result;
      const content = summaryContentSchema.safeParse(row.content);
      if (!content.success) {
        await deleteRow(userId, summaryId);
        return { kind: "failed", message: "conteúdo inválido" };
      }
      // A send whose answer never came (app closed, timeout): did the server take it?
      if (row.sending) {
        const server = await getSupabase()
          .from("summaries")
          .select("version, content")
          .eq("id", summaryId)
          .abortSignal(AbortSignal.timeout(SEND_TIMEOUT_MS));
        if (server.error) {
          if (server.status === 0) return { kind: "offline" };
          await deleteRow(userId, summaryId);
          return { kind: "failed", message: server.error.message };
        }
        const current = server.data[0];
        if (!current) {
          await deleteRow(userId, summaryId);
          return { kind: "conflict" };
        }
        if (current.version !== row.baseVersion) {
          if (!isOwnSend(row, current)) {
            await deleteRow(userId, summaryId);
            return { kind: "conflict" };
          }
          await rebase(row, current.version, summaryContentSchema.safeParse(current.content).data ?? null);
          result = { kind: "sent", version: current.version };
          continue;
        }
        // Still at her base version: that send didn't land; this one goes in its place.
      }
      await writeRow({
        ...row,
        sending: { version: row.baseVersion + 1, revision: row.revision, hash: contentHash(content.data) },
      });
      const { data, error, status } = await getSupabase()
        .from("summaries")
        .update({
          content: content.data,
          title: content.data.titulo,
          edited_by_user: true,
          version: row.baseVersion + 1,
        })
        .eq("id", summaryId)
        .eq("version", row.baseVersion)
        .select("version")
        .abortSignal(AbortSignal.timeout(SEND_TIMEOUT_MS));
      if (error) {
        if (status === 0) return { kind: "offline" };
        await deleteRow(userId, summaryId);
        return { kind: "failed", message: error.message };
      }
      // No row at that version: changed (or deleted) elsewhere. Never overwrite it.
      if (!data || data.length === 0) {
        await deleteRow(userId, summaryId);
        return { kind: "conflict" };
      }
      const version = data[0].version;
      await rebase({ ...row, sending: { version, revision: row.revision, hash: "" } }, version, content.data);
      result = { kind: "sent", version };
    }
  });
}

/** Same content whatever the key order (jsonb sorts the keys its own way): FNV-1a of a sorted JSON. */
export function contentHash(value: unknown): string {
  const sorted = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sorted)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sorted((v as Record<string, unknown>)[k])]),
          )
        : v;
  const text = JSON.stringify(sorted(value));
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return `${text.length}:${h.toString(16)}`;
}

/** The server holds the content of her unanswered send, at the version it would take. */
function isOwnSend(row: SummaryEditRow, server: { version: number; content: unknown }): boolean {
  return (
    row.sending !== undefined &&
    server.version === row.sending.version &&
    contentHash(summaryContentSchema.safeParse(server.content).data ?? server.content) === row.sending.hash
  );
}

/**
 * The server took a send of hers at `version`: nothing waits any more, or the edits made after it
 * wait on the new version. Reads the row again: an edit may have come in meanwhile.
 */
async function rebase(sent: SummaryEditRow, version: number, content: SummaryContent | null): Promise<void> {
  confirm(sent.summaryId, version, content);
  const now = await readRow(sent.userId, sent.summaryId);
  if (!now) return;
  if (now.revision === sent.sending?.revision) await deleteRow(sent.userId, sent.summaryId);
  else await writeRow({ ...now, baseVersion: version, sending: undefined });
}

/**
 * The server's summaries with her waiting edits on top. An edit made on an older version than the
 * server's is dropped (the server wins, she is told): returns which summaries that happened to.
 */
export async function withPendingEdits<T extends { id: string; version: number; content: SummaryContent }>(
  userId: string,
  rows: T[],
): Promise<{ rows: T[]; conflicts: string[] }> {
  const waiting = await pendingEdits(userId);
  const conflicts: string[] = [];
  const edits = new Map<string, { content: SummaryContent; version: number }>();
  for (const { summaryId } of waiting) {
    const server = rows.find((r) => r.id === summaryId);
    // After any send of this summary that is running now: the row may change when it answers.
    await inOrder(summaryId, async () => {
      const row = await readRow(userId, summaryId);
      const content = row && summaryContentSchema.safeParse(row.content);
      if (!row || !content?.success) return;
      // Deleted elsewhere: the edit has nowhere to go.
      if (!server) return deleteRow(userId, summaryId);
      if (server.version > row.baseVersion) {
        // Her own send landed, its answer didn't: what she edited after it still waits.
        if (isOwnSend(row, server)) {
          await rebase(row, server.version, server.content);
          const left = await readRow(userId, summaryId);
          const leftContent = left && summaryContentSchema.safeParse(left.content);
          if (left && leftContent?.success)
            edits.set(summaryId, { content: leftContent.data, version: server.version });
          return;
        }
        // Newer on the server than the version she edited: the server wins.
        conflicts.push(summaryId);
        return deleteRow(userId, summaryId);
      }
      // Same version, or this list was read before a send of hers landed: her edit is the newest.
      edits.set(summaryId, { content: content.data, version: row.baseVersion });
    });
  }
  const merged = rows.map((row) => {
    // Her edits waiting on top; else, if this list was read before her last send landed, that send.
    const known = confirmed.get(row.id);
    const edit =
      edits.get(row.id) ??
      (known?.content && known.version > row.version ? { content: known.content, version: known.version } : null);
    if (!edit) return row;
    return {
      ...row,
      content: edit.content,
      title: edit.content.titulo,
      edited_by_user: true,
      version: Math.max(row.version, edit.version),
    };
  });
  return { rows: merged, conflicts };
}
