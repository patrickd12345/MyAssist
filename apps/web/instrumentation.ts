import type * as SentryNext from "@sentry/nextjs";

export async function register() {
  if (!process.env.SENTRY_DSN?.trim() && !process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) {
    return;
  }
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Do not import `@sentry/nextjs` at module top level: it pulls `@sentry/core` into the server
 * graph for every route and can break dev with missing vendor-chunks when webpack cache is odd.
 * Only load Sentry when DSN is configured.
 */
export async function onRequestError(
  ...args: Parameters<typeof SentryNext.captureRequestError>
) {
  if (!process.env.SENTRY_DSN?.trim() && !process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) {
    return;
  }
  const { captureRequestError } = await import("@sentry/nextjs");
  return captureRequestError(...args);
}
