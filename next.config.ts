import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The deploy workflow builds into a staging folder (NEXT_DIST_DIR=.next-build)
  // while the live site keeps serving .next, then swaps the folders.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The Prisma SQL Server driver adapter relies on Node.js native networking
  // (tedious sockets/TLS). Turbopack only auto-externalizes @prisma/client, so
  // the adapter and its driver must be opted out of server bundling or their
  // connection handshake stalls until timeout.
  serverExternalPackages: ["@prisma/adapter-mssql", "mssql", "tedious"],
  // The service worker must never come from the HTTP cache, or a fix to its
  // caching rules would not reach browsers that already have it.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
  images: {
    // Blogger-hosted recipe photos that were not localized yet. Uploads under
    // /api/images and photos from other sites skip the optimizer (see
    // canOptimizeImage in src/lib/image.ts), so they need no pattern here.
    remotePatterns: [
      { protocol: "https", hostname: "blogger.googleusercontent.com", pathname: "/**", search: "" },
      { protocol: "https", hostname: "*.bp.blogspot.com", pathname: "/**", search: "" },
    ],
  },
};

export default nextConfig;
