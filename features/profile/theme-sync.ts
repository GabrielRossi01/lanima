"use client";

import { useCallback, useEffect } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import type { Profile } from "@/lib/profile/profile";
import type { ThemePreference } from "@/lib/theme/theme";
import { setThemePreference, useTheme } from "@/lib/theme/use-theme";
import { useUpdateProfile } from "./queries";

/**
 * The theme is applied before first paint from localStorage (no flash) and saved in
 * profiles.theme so it follows her across devices. A choice is "pending" from the moment it is made
 * until the server confirms it; if the app closes before that (or she was offline), it is sent when
 * the profile loads again, instead of being overwritten by the older server value.
 */
const PENDING_KEY = "lanima:theme-pending";

/** Whose choice is pending: on a shared tablet, it must never reach someone else's profile. */
function pendingUser(): string | null {
  try {
    return localStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

function setPending(userId: string | null) {
  try {
    if (userId) localStorage.setItem(PENDING_KEY, userId);
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // Ignore.
  }
}

type Save = (patch: { theme: ThemePreference }) => Promise<unknown>;

// Of this page load, not of a component: a save goes on after she leaves the Profile screen.
let latestUpload = 0;
let uploading = 0;
/** The server refused: the choice stays pending and is tried again on the next load, not in a loop. */
let refused = false;

async function upload(save: Save, userId: string, theme: ThemePreference) {
  const id = ++latestUpload;
  uploading++;
  refused = false;
  setPending(userId);
  try {
    await save({ theme });
    // Only the last choice settles it, and only if it is still hers.
    if (id === latestUpload && pendingUser() === userId) setPending(null);
  } catch {
    if (id === latestUpload) refused = true;
  } finally {
    uploading--;
  }
}

/** Applies the profile's theme on this device (or uploads a pending local choice). */
export function useThemeSync(profile: Profile | undefined) {
  const { mutateAsync } = useUpdateProfile();
  const remote = profile?.theme;
  const profileId = profile?.id;
  const signingUp = profile ? !profile.onboarding_completed_at : false;
  useEffect(() => {
    if (!remote || !profileId) return;
    const local = document.documentElement.getAttribute("data-theme-preference") as ThemePreference | null;
    if (pendingUser() === profileId) {
      // While saving, `remote` is the optimistic value, not the server's: it confirms nothing.
      if (uploading > 0 || refused) return;
      if (local && local !== remote) void upload(mutateAsync, profileId, local);
      else setPending(null);
      return;
    }
    if (local === remote) return;
    // A new account starts at "system", which nobody chose (the theme is only picked in Perfil):
    // during the sign-up the theme on the screen stays, and becomes the account's.
    if (signingUp && local) void upload(mutateAsync, profileId, local);
    else setThemePreference(remote);
  }, [remote, profileId, signingUp, mutateAsync]);
}

/** Theme preference that is also saved to the profile when she is signed in. */
export function useSyncedTheme() {
  const { preference } = useTheme();
  const { user } = useAuth();
  const { mutateAsync } = useUpdateProfile();
  const userId = user?.id;
  const setPreference = useCallback(
    (next: ThemePreference) => {
      setThemePreference(next);
      if (userId) void upload(mutateAsync, userId, next);
    },
    [mutateAsync, userId],
  );
  return { preference, setPreference };
}
