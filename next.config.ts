import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    // Phase 2 will route signed-out users to /entrar and new users to onboarding.
    return [{ source: "/", destination: "/inicio", permanent: false }];
  },
};

export default withSerwist(nextConfig);
