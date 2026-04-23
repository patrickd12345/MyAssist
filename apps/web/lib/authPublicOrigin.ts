"use client";

const MYASSIST_CANONICAL_ORIGIN = "https://myassist.bookiji.com";

function isBookijiHost(hostname: string): boolean {
  return hostname === "bookiji.com" || hostname.endsWith(".bookiji.com");
}

function isMyAssistHost(hostname: string): boolean {
  return hostname === "myassist.bookiji.com";
}

function tryParseOrigin(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function normalizeVercelHostToOrigin(hostRaw: string | null | undefined): string | null {
  const host = hostRaw?.trim();
  if (!host) return null;
  const noProto = host.replace(/^https?:\/\//, "");
  return tryParseOrigin(`https://${noProto}`);
}

function fallbackAuthOrigin(windowOrigin: string): string {
  const parsedWindowOrigin = tryParseOrigin(windowOrigin);
  if (!parsedWindowOrigin) return windowOrigin;
  try {
    const windowHost = new URL(parsedWindowOrigin).hostname;
    if (isBookijiHost(windowHost) && !isMyAssistHost(windowHost)) {
      return MYASSIST_CANONICAL_ORIGIN;
    }
  } catch {
    return windowOrigin;
  }
  return parsedWindowOrigin;
}

function resolveConfiguredOrigin(windowOrigin: string, configuredOriginRaw: string | null | undefined): string | null {
  const configuredOrigin = tryParseOrigin(configuredOriginRaw);
  if (!configuredOrigin) return null;

  const parsedWindowOrigin = tryParseOrigin(windowOrigin);
  if (!parsedWindowOrigin) {
    return configuredOrigin;
  }

  try {
    const windowHost = new URL(parsedWindowOrigin).hostname;
    const configuredHost = new URL(configuredOrigin).hostname;

    // For shared Bookiji hosts, MyAssist auth must return to MyAssist only.
    if (isBookijiHost(windowHost)) {
      if (!isMyAssistHost(configuredHost)) {
        return null;
      }
      return configuredOrigin;
    }

    if (configuredOrigin !== parsedWindowOrigin) {
      return null;
    }
  } catch {
    return null;
  }

  return configuredOrigin;
}

/**
 * Canonical browser origin for MyAssist auth redirects.
 * Rejects unsafe cross-origin config and enforces MyAssist canonical host on shared Bookiji origins.
 */
export function resolveMyAssistAuthRedirectOrigin(options: {
  windowOrigin: string;
  configuredSiteUrl?: string | null;
  vercelHost?: string | null;
}): string {
  const { windowOrigin, configuredSiteUrl, vercelHost } = options;
  const configuredSiteOrigin = resolveConfiguredOrigin(windowOrigin, configuredSiteUrl);
  if (configuredSiteOrigin) {
    return configuredSiteOrigin;
  }

  const vercelOrigin = normalizeVercelHostToOrigin(vercelHost);
  const configuredVercelOrigin = resolveConfiguredOrigin(windowOrigin, vercelOrigin);
  if (configuredVercelOrigin) {
    return configuredVercelOrigin;
  }

  return fallbackAuthOrigin(windowOrigin);
}

/**
 * Public origin for Supabase `redirectTo` / `emailRedirectTo`.
 * Prefer `NEXT_PUBLIC_SITE_URL` so magic links and OAuth return to the canonical MyAssist host
 * (avoids preview URL drift and misconfigured Supabase Site URL pointing at another product).
 * Falls back to `window.location.origin` when unset.
 */
export function resolveMyAssistBrowserPublicOrigin(): string {
  const windowOrigin = typeof window !== "undefined" ? window.location.origin : "";
  return resolveMyAssistAuthRedirectOrigin({
    windowOrigin,
    configuredSiteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    // Vercel: `VERCEL_URL` is deployment host forwarded at build to NEXT_PUBLIC_VERCEL_URL.
    vercelHost: process.env.NEXT_PUBLIC_VERCEL_URL,
  });
}

/** Absolute URL for `/auth/callback` including safe `callbackUrl` query. */
export function buildMyAssistAuthCallbackUrl(callbackPath: string): string {
  const origin = resolveMyAssistBrowserPublicOrigin();
  if (!origin) return "/auth/callback";
  const path = callbackPath.startsWith("/") ? callbackPath : "/";
  const u = new URL("/auth/callback", origin);
  u.searchParams.set("callbackUrl", path);
  return u.toString();
}
