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

export function resolvePublicOrigin(req: Request): string {
  const runtime = resolveMyAssistRuntimeEnv();
  const requestOrigin = new URL(req.url).origin;
  const forwardedOrigin = originFromForwardedHeaders(req);

  // In local development, always use the current request origin to avoid
  // OAuth redirect_uri mismatches when dev server runs on a non-default port.
  if (runtime.nodeEnv !== "production") {
    try {
      const host = new URL(requestOrigin).hostname;
      if (host === "localhost" || host === "127.0.0.1") {
        return requestOrigin;
      }
    } catch {
      // continue to configured fallback
    }
  }

  const configured =
    runtime.authUrl ||
    runtime.nextAuthUrl ||
    runtime.publicAppUrl;
  if (configured) {
    try {
      const origin = new URL(configured).origin;
      const host = new URL(origin).hostname;
      // Production often copies .env.local with AUTH_URL=http://localhost:3000 — that makes Google
      // redirect to localhost after consent ("site can't be reached"). Prefer the real request host.
      if (runtime.nodeEnv === "production" && (host === "localhost" || host === "127.0.0.1")) {
        return forwardedOrigin ?? requestOrigin;
      }
      return origin;
    } catch {
      // fallback to request origin
    }
  }
  return forwardedOrigin ?? requestOrigin;
}
