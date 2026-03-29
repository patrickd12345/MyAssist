import "server-only";

import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";
import type { IntegrationTokenPayload } from "../types";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export function googleClientId(): string | undefined {
  return resolveMyAssistRuntimeEnv().googleClientId || undefined;
}

function googleClientSecret(): string | undefined {
  return resolveMyAssistRuntimeEnv().googleClientSecret || undefined;
}

export function googleScopesFor(provider: "gmail" | "google_calendar"): string {
  if (provider === "gmail") {
    return [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.readonly",
    ].join(" ");
  }
  return [
    "openid",
    "email",
    "profile",
    // Write-capable scope for event create/update actions. Read remains covered.
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

export async function refreshGoogleToken(refreshToken: string): Promise<IntegrationTokenPayload> {
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
  return {
    access_token: typeof json.access_token === "string" ? json.access_token : undefined,
    refresh_token: refreshToken,
    token_type: typeof json.token_type === "string" ? json.token_type : "Bearer",
    scope: typeof json.scope === "string" ? json.scope : undefined,
    expires_at: Date.now() + expiresIn * 1000,
    raw: json,
  };
}
