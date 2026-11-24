"use client";

import type { Session } from "@supabase/supabase-js";
import { useIsRestoring, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AuthStatus } from "@/lib/auth/gate";
import { clearDeviceCache, isPersistedKey, LAST_USER_KEY, sessionEnded } from "@/lib/query/device-cache";
import { getSupabase } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { clearProfileCache } from "@/features/profile/cache";

export interface AuthUser {
  id: string;
  email: string | null;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** Signed out with the button, in this tab (not expired or ended elsewhere). */
  left: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readLastUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(LAST_USER_KEY);
    const parsed = raw ? (JSON.parse(raw) as AuthUser) : null;
    return parsed && typeof parsed.id === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeLastUser(user: AuthUser | null) {
  try {
    if (user) localStorage.setItem(LAST_USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(LAST_USER_KEY);
  } catch {
    // Storage blocked: offline start just won't be available.
  }
}

/** Erases what the device keeps about the last person who used it. */
function forgetLastUser() {
  const last = readLastUser();
  writeLastUser(null); // First: from here on, late cache writes are dropped (deviceStorage).
  clearDeviceCache();
  if (last) clearProfileCache(last.id);
}

/**
 * Session state for the whole app, read on the device (cookies written by @supabase/ssr).
 * No network is needed to know who is signed in, so the app opens offline.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const isRestoring = useIsRestoring();
  const endedRef = useRef(false);
  const leavingRef = useRef(false);
  // Without Supabase settings (misconfigured deploy) nobody can be signed in; the sign-in page says so.
  const [state, setState] = useState<{ status: AuthStatus; user: AuthUser | null; left: boolean }>(() => ({
    status: hasSupabaseEnv() ? "loading" : "signed-out",
    user: null,
    left: false,
  }));

  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    const supabase = getSupabase();

    function apply(session: Session | null, signedOut = false) {
      if (session) {
        // Another account took over without signing out: the previous person's copy goes away.
        const previous = readLastUser();
        if (previous && previous.id !== session.user.id) forgetLastUser();
        endedRef.current = false;
        leavingRef.current = false;
        const user = { id: session.user.id, email: session.user.email ?? null };
        writeLastUser(user);
        setState({ status: "signed-in", user, left: false });
        return;
      }
      // No session could be confirmed. Offline, that usually means the token expired and couldn't be
      // refreshed: keep the last user and cached data instead of showing the sign-in page.
      // Over a bad network the session stays stored, and so does the copy on the device.
      if (sessionEnded({ signedOut, online: navigator.onLine, cookies: document.cookie })) {
        endedRef.current = true;
        forgetLastUser();
        queryClient.clear();
      }
      const last = readLastUser();
      if (last && !navigator.onLine) setState({ status: "offline", user: last, left: false });
      else setState({ status: "signed-out", user: null, left: leavingRef.current });
    }

    // Fires INITIAL_SESSION right away, then every sign-in, sign-out and token refresh.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      apply(session, event === "SIGNED_OUT");
    });
    function onOnline() {
      void supabase.auth.getSession().then(({ data: { session } }) => apply(session));
    }
    window.addEventListener("online", onOnline);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("online", onOnline);
    };
  }, [queryClient]);

  // The saved lists are restored asynchronously and may land after the session was read: drop the
  // ones that don't belong to whoever is signed in, so they are never saved again.
  const { status } = state;
  const userId = state.user?.id;
  useEffect(() => {
    if (isRestoring) return;
    if (endedRef.current) queryClient.clear();
    else if (status === "signed-in") {
      queryClient.removeQueries({ predicate: (q) => isPersistedKey(q.queryKey) && q.queryKey[1] !== userId });
    }
  }, [isRestoring, queryClient, status, userId]);

  const signOut = useCallback(async () => {
    leavingRef.current = true;
    // Before the request: leaving must not depend on how fast (or whether) the network answers.
    forgetLastUser();
    // "local": only this device (the default, "global", ends the session on every device), and the
    // stored session is removed before the request, so it works without network too. Removing it
    // fires SIGNED_OUT, which finishes the job: apply() erases what is left and the gate goes to
    // /entrar. Nothing may run after the answer, which can be late: by then someone else may have
    // signed in, and it used to pull them back to /entrar and erase their data.
    await getSupabase().auth.signOut({ scope: "local" });
  }, []);

  const value = useMemo(() => ({ ...state, signOut }), [state, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
