import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@alive/shared"],
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  webpack(config) {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };
    return config;
  },
};

export default nextConfig;
