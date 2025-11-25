import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Silence "detected multiple lockfiles" warning in monorepo
  // process.cwd() returns absolute path at runtime
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
