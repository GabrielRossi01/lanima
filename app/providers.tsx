"use client";

import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useState, type ReactNode } from "react";
import { AuthProvider } from "@/features/auth/auth-provider";
import { CACHE_KEY, deviceStorage, isPersistedKey } from "@/lib/query/device-cache";

const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function createPersister() {
  // localStorage behind the async interface; without a window (prerender) it does nothing.
  const storage = typeof window === "undefined" ? undefined : deviceStorage(window.localStorage);
  return createAsyncStoragePersister({ storage, key: CACHE_KEY });
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
          shouldDehydrateQuery: (query) => query.state.status === "success" && isPersistedKey(query.queryKey),
        },
      }}
    >
      <AuthProvider>{children}</AuthProvider>
    </PersistQueryClientProvider>
  );
}
