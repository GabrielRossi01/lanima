"use client";

import { useCallback, useEffect, useRef } from "react";
import { create } from "zustand";
import { useProfile, useUpdateProfile } from "@/features/profile/queries";
import { readLocal, writeLocal } from "@/lib/db/local";
import {
  DEFAULT_PREFS,
  focusPrefsSchema,
  prefsFromProfile,
  prefsToColumns,
  samePrefs,
  type FocusPrefs,
} from "@/lib/focus/prefs";

interface PrefsStore {
  userId: string | null;
  ready: boolean;
  prefs: FocusPrefs;
  /** A choice the server hasn't confirmed: it wins over the profile until it is sent. */
  pending: boolean;
}

export const usePrefsStore = create<PrefsStore>()(() => ({
  userId: null,
  ready: false,
  prefs: DEFAULT_PREFS,
  pending: false,
}));

/** A volume drag makes dozens of changes: only the last one goes to the server. */
const SEND_AFTER_MS = 600;

function useSendPrefs() {
  const { mutateAsync } = useUpdateProfile();
  return useCallback(async () => {
    const { userId, prefs, pending } = usePrefsStore.getState();
    if (!userId || !pending) return;
    try {
      await mutateAsync(prefsToColumns(prefs));
    } catch {
      return; // Stays pending.
    }
    const now = usePrefsStore.getState();
    if (now.userId !== userId || !samePrefs(now.prefs, prefs)) return; // Changed meanwhile: another send follows.
    usePrefsStore.setState({ pending: false });
    void writeLocal(userId, (db) => db.focusPrefs.put({ userId, prefs, pending: false }));
  }, [mutateAsync]);
}

/**
 * Preferences of the focus mode: saved on the device at once (works offline) and then in the
 * profile, so they follow her across devices. Same rule as the theme: a choice stays pending until
 * the server confirms it, belongs to one account, and a refusal isn't retried in a loop (only on
 * the next change, load or reconnection).
 *
 * This loads them and keeps them up to date. Once per layout: the sound needs them on every screen.
 */
export function useFocusPrefsSync() {
  const { data: profile } = useProfile();
  const ready = usePrefsStore((s) => s.ready);
  const userId = usePrefsStore((s) => s.userId);
  const profileId = profile?.id;
  const send = useSendPrefs();

  // First read of this account: a pending choice on the device, otherwise the profile.
  useEffect(() => {
    if (!profile || !profileId || usePrefsStore.getState().userId === profileId) return;
    usePrefsStore.setState({
      userId: profileId,
      ready: false,
      pending: false,
      prefs: prefsFromProfile(profile),
    });
    void readLocal((db) => db.focusPrefs.get(profileId)).then((row) => {
      if (usePrefsStore.getState().userId !== profileId) return;
      const saved = focusPrefsSchema.safeParse(row?.prefs);
      if (row?.pending && saved.success && !usePrefsStore.getState().pending) {
        usePrefsStore.setState({ prefs: saved.data, pending: true });
        void send();
      }
      usePrefsStore.setState({ ready: true });
    });
  }, [profile, profileId, send]);

  // The profile changed (another device): follow it, unless there is a choice of hers to send.
  useEffect(() => {
    if (!profile || !ready || userId !== profile.id) return;
    const { pending, prefs } = usePrefsStore.getState();
    const remote = prefsFromProfile(profile);
    if (!pending && !samePrefs(prefs, remote)) usePrefsStore.setState({ prefs: remote });
  }, [profile, ready, userId]);

  useEffect(() => {
    const onOnline = () => void send();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [send]);
}

/** Preferences and how to change them (focus screen). */
export function useFocusPrefs() {
  const state = usePrefsStore();
  const send = useSendPrefs();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Leaving the screen: don't wait for the delay.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      void send();
    },
    [send],
  );

  const update = useCallback(
    (patch: Partial<FocusPrefs>) => {
      const { userId, prefs: before } = usePrefsStore.getState();
      const prefs = { ...before, ...patch };
      if (samePrefs(prefs, before)) return;
      usePrefsStore.setState({ prefs, pending: true });
      if (!userId) return;
      void writeLocal(userId, (db) => db.focusPrefs.put({ userId, prefs, pending: true }));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void send(), SEND_AFTER_MS);
    },
    [send],
  );

  return { prefs: state.prefs, ready: state.ready, update };
}
