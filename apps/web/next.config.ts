import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@alive/shared"],
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  async rewrites() {
    return [
      {
        source: "/landing",
        destination: "/landing/index.html",
      },
    ];
  },
};

export default nextConfig;
