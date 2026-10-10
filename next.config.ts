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
};

export default nextConfig;
