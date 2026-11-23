"use client";

import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useState, type ReactNode } from "react";
import { AuthProvider } from "@/features/auth/auth-provider";

/** Lists kept on the device so Matérias, Início and metas open offline (section 6). */
const PERSISTED = new Set(["subjects", "topics", "assessments", "goals"]);
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function createPersister() {
  // localStorage behind the async interface; without a window (prerender) it does nothing.
  const storage = typeof window === "undefined" ? undefined : window.localStorage;
  return createAsyncStoragePersister({ storage, key: "lanima:cache" });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // gcTime ≥ maxAge, otherwise restored lists would be dropped before use.
          queries: { retry: 1, refetchOnWindowFocus: true, networkMode: "offlineFirst", gcTime: CACHE_MAX_AGE },
          mutations: { networkMode: "always" },
        },
      }),
  );
  const [persister] = useState(createPersister);
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE,
        // Bump when the shape of cached data changes, so old copies are discarded.
        buster: "phase-3",
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => query.state.status === "success" && PERSISTED.has(String(query.queryKey[0])),
        },
      }}
    >
      <AuthProvider>{children}</AuthProvider>
    </PersistQueryClientProvider>
  );
}
