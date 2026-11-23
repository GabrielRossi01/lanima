import { defineConfig, devices } from "@playwright/test";
import { localSupabaseEnv } from "./tests/e2e/helpers/local-supabase";

const PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * E2E always runs against the LOCAL Supabase stack (`npm run db:start`), never a hosted project.
 * Exported to the environment so test workers (admin helpers, Mailpit) read the same values.
 */
const supabase = localSupabaseEnv();
process.env.E2E_SUPABASE_URL = supabase.url;
process.env.E2E_SUPABASE_PUBLISHABLE_KEY = supabase.publishableKey;
process.env.E2E_SUPABASE_SECRET_KEY = supabase.secretKey;
process.env.E2E_MAILPIT_URL = supabase.mailpitUrl;

/**
 * 127.0.0.1, not "localhost": on Windows "localhost" resolves to ::1 first, and on the dev
 * machine local HTTP over that path was intercepted (likely antivirus web protection): requests
 * reached `next start` 10–30 s late or never, while the server itself answered in ms.
 * With 127.0.0.1 the same suite passed 6/6 runs. Measured on 2026-11-22; see README.
 */
const HOST = "127.0.0.1";

/**
 * Explicit opt-in to test an already running production server (e.g. one that has been up for
 * a long time). Without it, Playwright always builds and starts its own server.
 */
const EXTERNAL_BASE_URL = process.env.E2E_BASE_URL;

/**
 * Engines: every iOS/iPadOS browser is WebKit, so the iPad and iPhone profiles run on WebKit;
 * Galaxy Tab and the Android phone run on Chromium.
 *
 * E2E_CHROMIUM_ONLY=1 (or `npm run test:e2e:chromium`) moves the Apple profiles to Chromium
 * (same viewport, touch and user agent), for Windows machines where antivirus blocks the WebKit
 * binary. CI always runs real WebKit.
 */
const chromiumOnly = process.env.E2E_CHROMIUM_ONLY === "1" || process.env.npm_lifecycle_event === "test:e2e:chromium";
const apple = chromiumOnly ? { browserName: "chromium" as const } : { browserName: "webkit" as const };
const chromium = { browserName: "chromium" as const };

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  // No retries: a flaky test is a bug to fix, not to hide.
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: EXTERNAL_BASE_URL ?? `http://${HOST}:${PORT}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "galaxy-tab-landscape", use: { ...devices["Galaxy Tab S9 landscape"], ...chromium } },
    { name: "galaxy-tab-portrait", use: { ...devices["Galaxy Tab S9"], ...chromium } },
    { name: "android-phone", use: { ...devices["Pixel 7"], ...chromium } },
    { name: "ipad-landscape", use: { ...devices["iPad Pro 11 landscape"], ...apple } },
    { name: "ipad-portrait", use: { ...devices["iPad Pro 11"], ...apple } },
    { name: "iphone", use: { ...devices["iPhone 16"], ...apple } },
  ],
  /**
   * Always the production build with the service worker active (Serwist is disabled only in
   * `next dev`). Never reuses a running server, so a stray `next dev` on the port can't be tested
   * by mistake: if the port is busy, the run fails instead.
   */
  webServer: EXTERNAL_BASE_URL
    ? undefined
    : {
        command: `npm run build && npx next start -H ${HOST} -p ${PORT}`,
        url: `http://${HOST}:${PORT}/inicio`,
        reuseExistingServer: false,
        timeout: 300_000,
        stdout: "pipe",
        // NEXT_PUBLIC_* values are inlined at build time, so the build itself must see them.
        env: {
          NEXT_PUBLIC_SUPABASE_URL: supabase.url,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
          NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "false",
        },
      },
});
