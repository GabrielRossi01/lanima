"use client";

import { liveQuery, type Subscription } from "dexie";
import { create } from "zustand";
import { isSignedIn, localDb, readLocal, writeLocal, type FocusSessionRow } from "@/lib/db/local";
import { focusSessionSchema, type FocusSession } from "@/lib/focus/sessions";
import { getSupabase } from "@/lib/supabase/client";

/**
 * Sessions completed on this device (section 6: written here first, sent when there is network). A
 * sent session stays for a while: this tab's list, or another tab's, may not include it yet, and the
 * numbers must never go back. Counting it twice is not possible (summarizeFocus).
 */
export interface LocalSession extends FocusSession {
  sent: boolean;
}

interface SessionStore {
  userId: string | null;
  sessions: LocalSession[];
  load: (userId: string) => void;
}

/** What couldn't be written on the device (storage full or blocked): kept for this visit only. */
let unsaved: { userId: string; session: LocalSession }[] = [];
let stored: LocalSession[] = [];
let subscription: Subscription | undefined;

export const useSessionStore = create<SessionStore>()((set, get) => ({
  userId: null,
  sessions: [],

  load(userId) {
    if (get().userId === userId) return;
    subscription?.unsubscribe();
    stored = [];
    set({ userId, sessions: merged(userId) });
    const db = localDb();
    if (!db) return;
    // Live: a session that ends in one tab counts in the others.
    subscription = liveQuery(() => db.focusSessions.where({ userId }).toArray()).subscribe({
      next: (rows) => {
        if (get().userId !== userId) return;
        stored = rows.flatMap(toLocal);
        set({ sessions: merged(userId) });
      },
      error: () => {},
    });
  },
}));

function toLocal(row: FocusSessionRow): LocalSession[] {
  const session = focusSessionSchema.safeParse(row.session);
  return session.success ? [{ ...session.data, sent: row.sent }] : [];
}

function merged(userId: string): LocalSession[] {
  const own = unsaved.filter((u) => u.userId === userId).map((u) => u.session);
  return [...stored, ...own.filter((u) => !stored.some((s) => s.startedAt === u.startedAt))];
}

/** Shows a session that just ended, at once. `saved`: it is already on the device. */
export function showSession(userId: string, session: FocusSession, saved: boolean): void {
  const local = { ...session, sent: false };
  if (saved) {
    if (useSessionStore.getState().userId !== userId || stored.some((s) => s.startedAt === session.startedAt)) return;
    stored = [...stored, local];
  } else {
    unsaved = [...unsaved, { userId, session: local }];
  }
  if (useSessionStore.getState().userId === userId) useSessionStore.setState({ sessions: merged(userId) });
}

async function pending(userId: string): Promise<LocalSession[]> {
  const rows = (await readLocal((db) => db.focusSessions.where({ userId }).toArray())) ?? [];
  const own = unsaved.filter((u) => u.userId === userId).map((u) => u.session);
  return [...rows.flatMap(toLocal), ...own].filter((s) => !s.sent);
}

export async function countUnsent(userId: string): Promise<number> {
  return (await pending(userId)).length;
}

async function markSent(userId: string, startedAt: number): Promise<void> {
  for (const u of unsaved) {
    if (u.userId === userId && u.session.startedAt === startedAt) u.session = { ...u.session, sent: true };
  }
  await writeLocal(userId, (db) => db.focusSessions.update([userId, startedAt], { sent: true }));
}

/** Long enough for any tab left open to load the server's list again. */
const KEEP_SENT_MS = 2 * 24 * 60 * 60 * 1000;

/** Forgets old sessions that the server's list already has. */
export async function forgetSent(userId: string, listed: readonly FocusSession[]): Promise<void> {
  const before = Date.now() - KEEP_SENT_MS;
  const starts = new Set(listed.filter((s) => s.endedAt < before).map((s) => s.startedAt));
  if (starts.size === 0) return;
  unsaved = unsaved.filter((u) => u.userId !== userId || !starts.has(u.session.startedAt));
  await writeLocal(userId, (db) =>
    db.focusSessions
      .where({ userId })
      .filter((row) => row.sent && starts.has(row.startedAt))
      .delete(),
  );
}

/** Never waits forever for an answer: the next try would be stuck behind it. */
const SEND_TIMEOUT_MS = 15_000;

async function upload(userId: string, session: LocalSession): Promise<{ ok: boolean; offline: boolean }> {
  const send = (subjectId: string | null) =>
    getSupabase()
      .from("focus_sessions")
      .upsert(
        {
          user_id: userId,
          subject_id: subjectId,
          started_at: new Date(session.startedAt).toISOString(),
          ended_at: new Date(session.endedAt).toISOString(),
          planned_min: session.minutes,
          actual_min: session.minutes,
        },
        // Sent before, or by another tab: nothing to do.
        { onConflict: "user_id,started_at", ignoreDuplicates: true },
      )
      .abortSignal(AbortSignal.timeout(SEND_TIMEOUT_MS));
  let result = await send(session.subjectId);
  // The subject was deleted meanwhile: the session still counts.
  if (result.error?.code === "23503" && session.subjectId) result = await send(null);
  return { ok: !result.error, offline: Boolean(result.error) && result.status === 0 };
}

let sending: Promise<boolean> | undefined;
/** One more round after the current one: a session may end just as it finishes. */
let queued: Promise<boolean> | undefined;

/**
 * Sends what is waiting. Resolves to whether anything was sent. A refusal isn't retried in a loop:
 * the next try is on the next session, load, reconnection or return to the app.
 */
export function sendSessions(userId: string): Promise<boolean> {
  if (sending) {
    const again = () => {
      queued = undefined;
      return sendSessions(userId);
    };
    return (queued ??= sending.then(again, again));
  }
  sending = run(userId).finally(() => (sending = undefined));
  return sending;
}

async function run(userId: string): Promise<boolean> {
  const tried = new Set<number>();
  let any = false;
  for (;;) {
    // Read again every time: a session may end while another is being sent.
    const session = (await pending(userId)).find((s) => !tried.has(s.startedAt));
    if (!session || !isSignedIn(userId)) return any;
    tried.add(session.startedAt);
    const { ok, offline } = await upload(userId, session);
    if (ok) {
      any = true;
      await markSent(userId, session.startedAt);
    } else if (offline) {
      return any;
    }
  }
}
