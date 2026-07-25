import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with only the files the server actually needs,
  // including the traced native better-sqlite3 binding. This is what the
  // Docker image runs.
  output: "standalone",
};

export default nextConfig;
