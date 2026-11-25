import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native SQLite driver: keep it out of the bundle.
  serverExternalPackages: ["@libsql/client", "libsql", "@mastra/core"],
  // Hides the Next.js round badge that dev mode draws in the corner of the screen.
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
