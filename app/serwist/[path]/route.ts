import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

/** Cache-busting revision for precached pages: the deployed commit. */
function buildRevision(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" });
  return git.status === 0 && git.stdout ? git.stdout.trim() : "local";
}

const revision = buildRevision();

/**
 * Serwist's documented route handler: `force-static` + `revalidate = false` +
 * `generateStaticParams`, so /serwist/sw.js is bundled once at `next build` and never at runtime.
 * This requires `cacheComponents` to be off (see next.config.ts).
 */
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  additionalPrecacheEntries: [
    { url: "/~offline", revision },
    { url: "/inicio", revision },
    // Taking a test and its result work offline from the first time (section 6), even if she never
    // opened them with network: one page each, the test or attempt comes in the query (app/sw.ts).
    { url: "/estudo/fazer", revision },
    { url: "/estudo/resultado", revision },
  ],
  // Serwist's default glob, plus self-hosted fonts (.woff2) so they work offline from the first launch.
  globPatterns: [".next/static/**/*.{js,css,html,ico,png,svg,webp,json,webmanifest,woff2}", "public/**/*"],
  // Sounds are kept after the first time they play, and the text readers (pdf.js, OCR) after the first
  // file (app/sw.ts): only what she uses is downloaded.
  globIgnores: ["public/sounds/**", "public/vendor/**"],
  swSrc: "app/sw.ts",
  useNativeEsbuild: true,
});
