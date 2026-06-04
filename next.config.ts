import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["100.64.215.81"],
  serverExternalPackages: ["better-sqlite3"]
};

export default nextConfig;
