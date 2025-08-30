// next.config.ts
import type { NextConfig } from "next";
import webpack from "webpack";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      buffer: require.resolve("buffer/"),
      process: require.resolve('process/browser'),
    };
    config.plugins.push(
      new webpack.ProvidePlugin({
        Buffer: ["buffer", "Buffer"],
        process: ['process'],
      })
    );
    return config;
  },
};

export default nextConfig;
