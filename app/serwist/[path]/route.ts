import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

/**
 * Cache-busting revision for precached pages: the deployed commit.
 * No random/time fallback: with Cache Components that would make the route dynamic.
 */
function buildRevision(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" });
  return git.status === 0 && git.stdout ? git.stdout.trim() : "local";
}

const revision = buildRevision();

const serwist = createSerwistRoute({
  additionalPrecacheEntries: [
    { url: "/~offline", revision },
    { url: "/inicio", revision },
  ],
  // Serwist's default glob, plus self-hosted fonts (.woff2) so they work offline from the first launch.
  globPatterns: [".next/static/**/*.{js,css,html,ico,png,svg,webp,json,webmanifest,woff2}", "public/**/*"],
  swSrc: "app/sw.ts",
  useNativeEsbuild: true,
});

const CONTENT_TYPES: Record<string, string> = {
  ".js": "application/javascript",
  ".map": "application/json",
};

/**
 * Serwist bundles the worker lazily, per process. Under Cache Components that async work
 * would make the route dynamic (re-bundling on every cold start in production), so the
 * bundle output is wrapped in `use cache`, following the Next.js guide for
 * "Route Handlers with Cache Components": it is generated once at build time and served static.
 */
async function bundledFile(path: Promise<string>): Promise<string> {
  "use cache";
  const resolved = await path;
  const response = await serwist.GET(new Request("http://localhost/"), {
    params: Promise.resolve({ path: resolved }),
  });
  return response.text();
}

export const generateStaticParams = serwist.generateStaticParams;

export async function GET(_request: Request, { params }: RouteContext<"/serwist/[path]">) {
  const path = params.then((p) => p.path);
  const body = await bundledFile(path);
  const ext = (await path).match(/\.[a-z]+$/)?.[0] ?? "";
  return new Response(body, {
    headers: {
      "Content-Type": CONTENT_TYPES[ext] ?? "text/plain",
      "Service-Worker-Allowed": "/",
    },
  });
}
