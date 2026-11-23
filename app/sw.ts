/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** Supabase API paths, on whatever host the project uses (no env needed inside the worker). */
const SUPABASE_API = /^\/(?:auth|rest|storage|realtime|functions|graphql)\/v1\//;

function isSupabaseApi({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) {
  return !sameOrigin && SUPABASE_API.test(url.pathname);
}

const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Supabase calls go straight to the network and are never cached: they carry one user's data and
 * tokens, and Serwist's default "cross-origin" rule (NetworkFirst) would keep GET responses
 * (profile, subjects, signed URLs) in a cache that the next person on a shared tablet could get
 * offline. Offline data is the app's job (on-device cache now, Dexie later), per user.
 * Exception: profile photos at signed URLs. Each upload has a new file name, so a cached copy is
 * never stale, and it lets the avatar show offline.
 */
const supabaseRules: RuntimeCaching[] = [
  {
    matcher: ({ url, sameOrigin }) =>
      isSupabaseApi({ url, sameOrigin }) && url.pathname.startsWith("/storage/v1/object/sign/avatars/"),
    method: "GET",
    handler: new CacheFirst({
      cacheName: "avatars",
      plugins: [new ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: 7 * 24 * 60 * 60 })],
    }),
  },
  ...METHODS.map((method) => ({ matcher: isSupabaseApi, method, handler: new NetworkOnly() })),
];

/*
 * App shell (precached build assets + /inicio), self-hosted fonts and pages via Serwist's default
 * runtime caching, with an offline fallback page. Later phases add caches for 3D models, ambient
 * sounds and OCR language data.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...supabaseRules, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
