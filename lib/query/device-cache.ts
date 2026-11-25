/**
 * What the app keeps on the device about the signed-in person, and how it is forgotten when their
 * session ends. The lists are written by TanStack Query's persister (app/providers.tsx).
 */
export const CACHE_KEY = "lanima:cache";
/** Last signed-in user on this device, so the app still opens offline with an expired token. */
export const LAST_USER_KEY = "lanima:last-user";

/** Lists kept on the device so Matérias, Início and metas open offline (section 6). */
const PERSISTED = new Set(["subjects", "topics", "assessments", "goals", "focus"]);

export function isPersistedKey(queryKey: readonly unknown[]): boolean {
  return PERSISTED.has(String(queryKey[0]));
}

/**
 * Storage for the persister. It saves on a 1 s throttle, so a write scheduled before sign-out could
 * land after the copy was erased: with nobody signed in, writes are dropped.
 */
export function deviceStorage(storage: Storage) {
  return {
    getItem: (key: string) => storage.getItem(key),
    setItem: (key: string, value: string) => {
      if (storage.getItem(LAST_USER_KEY) !== null) storage.setItem(key, value);
    },
    removeItem: (key: string) => storage.removeItem(key),
  };
}

export function clearDeviceCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Storage blocked: nothing was saved either.
  }
}

/**
 * Whether a Supabase session is still stored in the cookies. A refresh that fails for lack of
 * network leaves it there; a session that really ended does not. Chunked cookies end in ".0", ".1";
 * the PKCE "-code-verifier" cookies are not a session.
 */
export function hasStoredSession(cookies: string): boolean {
  return /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=[^;]/.test(cookies);
}

/**
 * Whether "no session" means it really ended (erase the device's copy) or just couldn't be confirmed
 * (offline, or a refresh that failed for lack of network: keep it).
 */
export function sessionEnded(now: { signedOut: boolean; online: boolean; cookies: string }): boolean {
  return now.signedOut || (now.online && !hasStoredSession(now.cookies));
}
