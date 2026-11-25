"use client";

import { liveQuery, type Subscription } from "dexie";
import { create } from "zustand";
import { localDb, writeLocal } from "@/lib/db/local";
import { advance, initialTimer, isOver, timerSchema, type TimerState } from "@/lib/focus/timer";

interface TimerStore {
  userId: string | null;
  /** False until the timer saved on this device was read. */
  ready: boolean;
  timer: TimerState;
  load: (userId: string) => void;
  /** Applies a pure transition (lib/focus/timer.ts) and saves the result on the device. */
  act: (transition: (timer: TimerState, now: number) => TimerState) => void;
  /** Moves on if the phase ended; returns the phase that ended, for the notice. */
  finish: () => TimerState["phase"] | null;
}

let subscription: Subscription | undefined;

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

  act(transition) {
    const { timer, userId } = get();
    const now = Date.now();
    const next = transition(timer, now);
    if (next === timer) return;
    // Always ahead of the previous write, even if two happen in the same millisecond.
    const state = { ...next, updatedAt: Math.max(now, timer.updatedAt + 1) };
    set({ timer: state });
    if (userId) void writeLocal(userId, (db) => db.focusTimer.put({ userId, state }));
  },

  finish() {
    const { timer, act } = get();
    if (!isOver(timer, Date.now())) return null;
    act(advance);
    return timer.phase;
  },
}));
