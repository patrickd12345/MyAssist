import type { NextConfig } from "next";

/**
 * Do **not** wrap with `withSentryConfig` from `@sentry/nextjs`.
 *
 * That wrapper adds webpack splitting/instrumentation that emits server `vendor-chunks/@sentry+core@*.js`
 * references. On Vercel those chunks can be missing at runtime (OAuth callbacks and other API routes
 * crash with "Cannot find module './vendor-chunks/@sentry+core@…'").
 *
 * Sentry still runs from `instrumentation.ts` + `sentry.server.config.ts` / `sentry.edge.config.ts` /
 * `sentry.client.config.ts` + `global-error.tsx`. You lose automatic build-time sourcemap upload unless
 * you add `sentry-cli` or CI; runtime error capture remains.
 */
const nextConfig: NextConfig = {
  // Expose Vercel deployment host to the client for OAuth / magic link `redirectTo` when
  // NEXT_PUBLIC_SITE_URL is not set (preview deploys). Custom domains: still set NEXT_PUBLIC_SITE_URL to the public origin.
  env: {
    NEXT_PUBLIC_VERCEL_URL: process.env.VERCEL_URL ?? "",
  },
  transpilePackages: [
    "job-hunt-manager",
    "@bookiji-inc/ai-runtime",
    "@bookiji-inc/error-contract",
    "@bookiji-inc/observability",
  ],
  webpack: (config, { dev }) => {
    if (dev) {
      // Avoid PackFileCacheStrategy "Array buffer allocation failed" on constrained Windows setups.
      config.cache = { type: "memory", maxGenerations: 1 };
    }
    // job-hunt-manager sources use .js extensions in imports (Node ESM); map to .ts for bundling.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /require-in-the-middle/,
        message: /require function is used in a way in which dependencies cannot be statically extracted/,
      },
      {
        module: /@opentelemetry\/instrumentation/,
        message: /the request of a dependency is an expression/,
      },
    ];
    return config;
  },
};

export default nextConfig;
