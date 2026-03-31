import "server-only";

import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";
import type { IntegrationTokenPayload } from "../types";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

/**
 * Phase B Gmail MVP — read-only mailbox access + OpenID / profile.
 * Intentionally excludes gmail.modify (mark read/unarchive flows need a later scope bump).
 */
export const GMAIL_MVP_OAUTH_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
] as const;

export function googleClientId(): string | undefined {
  return resolveMyAssistRuntimeEnv().googleClientId || undefined;
}

function googleClientSecret(): string | undefined {
  return resolveMyAssistRuntimeEnv().googleClientSecret || undefined;
}

export function googleScopesFor(provider: "gmail" | "google_calendar"): string {
  if (provider === "gmail") {
    return GMAIL_MVP_OAUTH_SCOPES.join(" ");
  }
  return [
    "openid",
    "email",
    "profile",
    /** Full event access: required by existing MyAssist calendar create/update flows; intelligence layer only GETs. */
    "https://www.googleapis.com/auth/calendar.events",
  ].join(" ");
}

export function buildGoogleAuthUrl(input: {
  redirectUri: string;
  state: string;
  provider: "gmail" | "google_calendar";
}): string {
  const cid = googleClientId();
  if (!cid) throw new Error("GOOGLE_CLIENT_ID is not configured");
  const params = new URLSearchParams({
    client_id: cid,
    redirect_uri: input.redirectUri,
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    scope: googleScopesFor(input.provider),
    state: input.state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/** Merge a new token response with a prior row so refresh_token / scope survive Google omitting them on re-consent. */
export function mergeGoogleTokenPayload(
  existing: IntegrationTokenPayload | null,
  incoming: IntegrationTokenPayload,
): IntegrationTokenPayload {
  return {
    ...incoming,
    access_token: incoming.access_token ?? existing?.access_token,
    refresh_token: incoming.refresh_token ?? existing?.refresh_token,
    scope: incoming.scope ?? existing?.scope,
    expires_at: incoming.expires_at ?? existing?.expires_at,
    token_type: incoming.token_type ?? existing?.token_type,
    provider_account_id: incoming.provider_account_id ?? existing?.provider_account_id,
    provider_account_email: incoming.provider_account_email ?? existing?.provider_account_email,
    raw: incoming.raw ?? existing?.raw,
  };
}

export async function fetchGoogleOAuthUserInfo(accessToken: string): Promise<{
  sub?: string;
  email?: string;
} | null> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as Record<string, unknown>;
  return {
    sub: typeof json.sub === "string" ? json.sub : undefined,
    email: typeof json.email === "string" ? json.email : undefined,
  };
}

export async function exchangeGoogleCode(input: {
  code: string;
  redirectUri: string;
}): Promise<IntegrationTokenPayload> {
  const cid = googleClientId();
  const secret = googleClientSecret();
  if (!cid || !secret) {
    throw new Error("Google OAuth credentials are not configured");
  }
  const body = new URLSearchParams({
    code: input.code,
    client_id: cid,
    client_secret: secret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  const json = (await res.json()) as Record<string, unknown>;
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  return {
    access_token: typeof json.access_token === "string" ? json.access_token : undefined,
    refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    token_type: typeof json.token_type === "string" ? json.token_type : undefined,
    scope: typeof json.scope === "string" ? json.scope : undefined,
    expires_at: Date.now() + expiresIn * 1000,
    raw: json,
  };
}

export async function refreshGoogleToken(
  refreshToken: string,
  existing?: IntegrationTokenPayload | null,
): Promise<IntegrationTokenPayload> {
  const cid = googleClientId();
  const secret = googleClientSecret();
  if (!cid || !secret) {
    throw new Error("Google OAuth credentials are not configured");
  }
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: cid,
    client_secret: secret,
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google token refresh failed (${res.status})`);
  const json = (await res.json()) as Record<string, unknown>;
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  const incoming: IntegrationTokenPayload = {
    access_token: typeof json.access_token === "string" ? json.access_token : undefined,
    refresh_token: refreshToken,
    token_type: typeof json.token_type === "string" ? json.token_type : "Bearer",
    scope: typeof json.scope === "string" ? json.scope : undefined,
    expires_at: Date.now() + expiresIn * 1000,
    raw: json,
  };
  return mergeGoogleTokenPayload(existing ?? null, incoming);
}
