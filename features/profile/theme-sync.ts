"use client";

import { useCallback, useEffect } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import type { Profile } from "@/lib/profile/profile";
import type { ThemePreference } from "@/lib/theme/theme";
import { setThemePreference, useTheme } from "@/lib/theme/use-theme";
import { useUpdateProfile } from "./queries";

/**
 * The theme is applied before first paint from localStorage (no flash) and saved in
 * profiles.theme so it follows her across devices. A choice made offline is marked "pending" and
 * pushed when the profile loads again, instead of being overwritten by the older server value.
 */
const PENDING_KEY = "lanima:theme-pending";

function isPending() {
  try {
    return localStorage.getItem(PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

function setPending(pending: boolean) {
  try {
    if (pending) localStorage.setItem(PENDING_KEY, "1");
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // Ignore.
  }
}

/** Applies the profile's theme on this device (or uploads a pending local choice). */
export function useThemeSync(profile: Profile | undefined) {
  const update = useUpdateProfile();
  const { mutate } = update;
  const remote = profile?.theme;
  const profileId = profile?.id;
  useEffect(() => {
    if (!remote || !profileId) return;
    const local = document.documentElement.getAttribute("data-theme-preference") as ThemePreference | null;
    if (isPending()) {
      if (local && local !== remote) mutate({ theme: local }, { onSuccess: () => setPending(false) });
      else setPending(false);
      return;
    }
    if (local !== remote) setThemePreference(remote);
  }, [remote, profileId, mutate]);
}

/** Theme preference that is also saved to the profile when she is signed in. */
export function useSyncedTheme() {
  const { preference } = useTheme();
  const { user } = useAuth();
  const { mutate } = useUpdateProfile();
  const setPreference = useCallback(
    (next: ThemePreference) => {
      setThemePreference(next);
      if (!user) return;
      setPending(true);
      mutate({ theme: next }, { onSuccess: () => setPending(false) });
    },
    [mutate, user],
  );
  return { preference, setPreference };
}
