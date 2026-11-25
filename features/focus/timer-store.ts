"use client";

import { liveQuery, type Subscription } from "dexie";
import { create } from "zustand";
import { localDb, writeLocal } from "@/lib/db/local";
import { sessionOf, type FocusSession } from "@/lib/focus/sessions";
import { advance, initialTimer, isOver, timerSchema, type TimerState } from "@/lib/focus/timer";
import { showSession } from "./session-store";

export interface EndedPhase {
  phase: TimerState["phase"];
  /** The focus session recorded; null for a break. */
  session: FocusSession | null;
}

interface TimerStore {
  userId: string | null;
  /** False until the timer saved on this device was read. */
  ready: boolean;
  timer: TimerState;
  load: (userId: string) => void;
  /** Forgets the timer (signed out). */
  unload: () => void;
  /** Applies a pure transition (lib/focus/timer.ts) and saves the result on the device. */
  act: (transition: (timer: TimerState, now: number) => TimerState) => void;
  /** If the time is up, records the session and moves on; resolves to what ended, for the notice. */
  finish: () => Promise<EndedPhase | null>;
}

let subscription: Subscription | undefined;
let finishing = false;

/** Always ahead of the previous write, even if two happen in the same millisecond. */
function stamped(next: TimerState, previous: TimerState, now: number): TimerState {
  return { ...next, updatedAt: Math.max(now, previous.updatedAt + 1) };
}

export const useTimerStore = create<TimerStore>()((set, get) => ({
  userId: null,
  ready: false,
  timer: initialTimer(),

  load(userId) {
    if (get().userId === userId) return;
    subscription?.unsubscribe();
    set({ userId, ready: false, timer: initialTimer() });
    const db = localDb();
    if (!db) {
      set({ ready: true });
      return;
    }
    // Live: pausing in one tab pauses in the other.
    subscription = liveQuery(() => db.focusTimer.get(userId)).subscribe({
      next: (row) => {
        if (get().userId !== userId) return;
        const saved = timerSchema.safeParse(row?.state);
        const newer = saved.success && saved.data.updatedAt > get().timer.updatedAt;
        set(newer ? { ready: true, timer: saved.data } : { ready: true });
      },
      error: () => set({ ready: true }),
    });
  },

  unload() {
    if (get().userId === null) return;
    subscription?.unsubscribe();
    set({ userId: null, ready: false, timer: initialTimer() });
  },

  act(transition) {
    const { timer, userId } = get();
    const now = Date.now();
    const next = transition(timer, now);
    if (next === timer) return;
    const state = stamped(next, timer, now);
    set({ timer: state });
    if (userId) void writeLocal(userId, (db) => db.focusTimer.put({ userId, state }));
  },

  async finish() {
    const { timer, userId } = get();
    const now = Date.now();
    if (finishing || !userId || !isOver(timer, now)) return null;
    finishing = true;
    try {
      const session = sessionOf(timer);
      const state = stamped(advance(timer), timer, now);
      let newer: TimerState | undefined;
      // Session and timer together, or neither. The saved timer decides: this tab may have been
      // asleep while another one paused, restarted or already finished it.
      const saved = await writeLocal(userId, (db) =>
        db.transaction("rw", db.focusTimer, db.focusSessions, async () => {
          const row = timerSchema.safeParse((await db.focusTimer.get(userId))?.state);
          if (row.success && row.data.updatedAt > timer.updatedAt) {
            newer = row.data;
            return;
          }
          await db.focusTimer.put({ userId, state });
          if (session) await db.focusSessions.put({ userId, startedAt: session.startedAt, session, sent: false });
        }),
      );
      if (get().userId !== userId) return null;
      if (newer) {
        if (newer.updatedAt > get().timer.updatedAt) set({ timer: newer });
        return null;
      }
      if (state.updatedAt > get().timer.updatedAt) set({ timer: state });
      if (session) showSession(userId, session, saved);
      return { phase: timer.phase, session };
    } finally {
      finishing = false;
    }
  },
}));
