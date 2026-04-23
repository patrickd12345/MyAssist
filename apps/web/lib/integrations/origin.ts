import "server-only";
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";

/** Vercel / reverse proxies often set these; `req.url` can be internal while this matches the browser host. */
function originFromForwardedHeaders(req: Request): string | null {
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (!host || host === "localhost" || host.startsWith("127.")) return null;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  try {
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return null;
  }
}

/**
 * Public origin for integration OAuth `redirect_uri` construction.
 * Trusts `x-forwarded-host` over a mismatched `AUTH_URL` so a stale Bookiji URL cannot override the
 * hostname the browser actually hit; when hosts align, uses configured URL for canonical scheme/port.
 */
export function resolvePublicOrigin(req: Request): string {
  const runtime = resolveMyAssistRuntimeEnv();
  const requestOrigin = new URL(req.url).origin;
  const forwardedOrigin = originFromForwardedHeaders(req);
  const effectiveIncoming = forwardedOrigin ?? requestOrigin;

  if (runtime.nodeEnv !== "production") {
    try {
      const host = new URL(effectiveIncoming).hostname;
      if (host === "localhost" || host === "127.0.0.1") {
        return effectiveIncoming;
      }
    } catch {
      // fall through
    }
  }

  const configured = runtime.authUrl || runtime.nextAuthUrl || runtime.publicAppUrl;
  if (!configured?.trim()) {
    return effectiveIncoming;
  }

  try {
    const configuredOrigin = new URL(configured).origin;
    const cfgHost = new URL(configuredOrigin).hostname;
    const incomingHost = new URL(effectiveIncoming).hostname;

    if (runtime.nodeEnv === "production" && (cfgHost === "localhost" || cfgHost === "127.0.0.1")) {
      return effectiveIncoming;
    }

    if (cfgHost === incomingHost) {
      return configuredOrigin;
    }

    if (runtime.nodeEnv === "production") {
      return effectiveIncoming;
    }

    return configuredOrigin;
  } catch {
    return effectiveIncoming;
  }
}
