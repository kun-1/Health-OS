import type { NextConfig } from "next";

// Wave 1 review fix (H2): was hardcoded to a Tailscale private IP, now env-
// driven. Set NEXT_DEV_ORIGIN to a comma-separated list (e.g. "100.64.0.1,
// foo.tail.ts.net") to whitelist extra dev origins; missing/empty falls back
// to [] so Next.js' default behaviour applies.
const allowedDevOrigins =
  process.env.NEXT_DEV_ORIGIN?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  allowedDevOrigins,
  // Wave 3b worker: sharp and better-sqlite3 are native modules that must
  // be required at runtime, not bundled. Without this, webpack tries to
  // inline them into the server build (and the edge build, which can't
  // load them at all).
  serverExternalPackages: ["better-sqlite3", "sharp"],
  // Wave 1 (Feature #6): serve uploaded receipts from data/expense-receipts
  // without copying them into /public. The /expense-receipts/* URL is
  // forwarded to the file-serving API route.
  // Wave 2 feature: image compression — catch-all so nested paths like
  // /expense-receipts/originals/{id}.jpg work after the originals/ split.
  async rewrites() {
    return [
      {
        source: "/expense-receipts/:filename*",
        destination: "/api/expenses/receipts/file/:filename*"
      }
    ];
  }
};

export default nextConfig;
