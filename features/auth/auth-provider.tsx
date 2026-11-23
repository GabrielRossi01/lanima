"use client";

import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthStatus } from "@/lib/auth/gate";
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
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Last signed-in user on this device, so the app still opens offline with an expired token. */
const LAST_USER_KEY = "lanima:last-user";

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

/**
 * Session state for the whole app, read on the device (cookies written by @supabase/ssr).
 * No network is needed to know who is signed in, so the app opens offline.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // Without Supabase settings (misconfigured deploy) nobody can be signed in; the sign-in page says so.
  const [state, setState] = useState<{ status: AuthStatus; user: AuthUser | null }>(() => ({
    status: hasSupabaseEnv() ? "loading" : "signed-out",
    user: null,
  }));

  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    const supabase = getSupabase();

    function apply(session: Session | null) {
      if (session) {
        const user = { id: session.user.id, email: session.user.email ?? null };
        writeLastUser(user);
        setState({ status: "signed-in", user });
        return;
      }
      // No session could be confirmed. Offline, that usually means the token expired and couldn't be
      // refreshed: keep the last user and cached data instead of showing the sign-in page.
      const last = readLastUser();
      if (last && !navigator.onLine) setState({ status: "offline", user: last });
      else setState({ status: "signed-out", user: null });
    }

    // Fires INITIAL_SESSION right away, then every sign-in, sign-out and token refresh.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") writeLastUser(null);
      apply(session);
    });
    function onOnline() {
      void supabase.auth.getSession().then(({ data: { session } }) => apply(session));
    }
    window.addEventListener("online", onOnline);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("online", onOnline);
    };
  }, []);

  const signOut = useCallback(async () => {
    const userId = state.user?.id;
    await getSupabase().auth.signOut();
    writeLastUser(null);
    if (userId) clearProfileCache(userId);
    queryClient.clear();
  }, [queryClient, state.user?.id]);

  const value = useMemo(() => ({ ...state, signOut }), [state, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
