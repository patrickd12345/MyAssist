import "server-only";

import { resolvePublicOrigin } from "@/lib/integrations/origin";
import { safeInternalPath } from "@/lib/safeInternalPath";

/**
 * Single canonical public origin for MyAssist server-side auth links (email reset, callback redirects).
 * Same policy as integration OAuth: trusts forwarded host over a mismatched `AUTH_URL` in shared env.
 */
export function resolveMyAssistSiteOriginForRequest(request: Request): string {
  return resolvePublicOrigin(request);
}

/** Same shape as `buildMyAssistAuthCallbackUrl` in `authPublicOrigin.ts`, for Route Handlers and server `signUp`. */
export function buildMyAssistAuthCallbackUrlForRequest(
  request: Request,
  callbackPathRaw: string | null | undefined,
): string {
  const origin = resolveMyAssistSiteOriginForRequest(request);
  const path = safeInternalPath(callbackPathRaw);
  const u = new URL("/auth/callback", origin);
  u.searchParams.set("callbackUrl", path);
  return u.toString();
}
