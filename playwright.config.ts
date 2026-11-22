import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * E2E_CHROMIUM_ONLY=1 runs the iPad/iPhone profiles (viewport, touch, user agent) on Chromium.
 * Useful on Windows machines where antivirus blocks the WebKit binary; CI runs real WebKit.
 */
const chromiumOnly = process.env.E2E_CHROMIUM_ONLY === "1" || process.env.npm_lifecycle_event === "test:e2e:chromium";
const webkit = chromiumOnly ? { browserName: "chromium" as const } : {};

/**
 * Device matrix from section 2: Galaxy Tab S (main device), iPad Pro 11, iPhone.
 * Runs against the production build (`next build` first), so the service worker is real.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // Chromium + WebKit side by side overload `next start` on modest machines; 2 is stable.
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "galaxy-tab-landscape", use: { ...devices["Galaxy Tab S9 landscape"] } },
    { name: "galaxy-tab-portrait", use: { ...devices["Galaxy Tab S9"] } },
    { name: "ipad-landscape", use: { ...devices["iPad Pro 11 landscape"], ...webkit } },
    { name: "ipad-portrait", use: { ...devices["iPad Pro 11"], ...webkit } },
    { name: "iphone", use: { ...devices["iPhone 16"], ...webkit } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/inicio`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
