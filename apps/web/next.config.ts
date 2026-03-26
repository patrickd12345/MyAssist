import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["job-hunt-manager"],
  webpack: (config, { dev }) => {
    if (dev) {
      // Avoid PackFileCacheStrategy "Array buffer allocation failed" on constrained Windows setups.
      config.cache = false;
    }
    // job-hunt-manager sources use .js extensions in imports (Node ESM); map to .ts for bundling.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
