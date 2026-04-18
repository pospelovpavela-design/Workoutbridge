import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["bullmq", "ioredis"],
  },
};

export default nextConfig;
