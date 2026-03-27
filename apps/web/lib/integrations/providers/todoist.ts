import "server-only";

import type { IntegrationTokenPayload } from "../types";

const TODOIST_AUTH_URL = "https://todoist.com/oauth/authorize";
const TODOIST_TOKEN_URL = "https://todoist.com/oauth/access_token";

function todoistClientId(): string | undefined {
  return process.env.TODOIST_CLIENT_ID?.trim() || process.env.MYASSIST_TODOIST_CLIENT_ID?.trim();
}

function todoistClientSecret(): string | undefined {
  return (
    process.env.TODOIST_CLIENT_SECRET?.trim() || process.env.MYASSIST_TODOIST_CLIENT_SECRET?.trim()
  );
}

export function buildTodoistAuthUrl(input: { redirectUri: string; state: string }): string {
  const cid = todoistClientId();
  if (!cid) throw new Error("TODOIST_CLIENT_ID is not configured");
  const params = new URLSearchParams({
    client_id: cid,
    scope: "data:read_write",
    state: input.state,
    redirect_uri: input.redirectUri,
  });
  return `${TODOIST_AUTH_URL}?${params.toString()}`;
}

export async function exchangeTodoistCode(input: {
  code: string;
  redirectUri: string;
}): Promise<IntegrationTokenPayload> {
  const cid = todoistClientId();
  const secret = todoistClientSecret();
  if (!cid || !secret) throw new Error("Todoist OAuth credentials are not configured");
  const body = new URLSearchParams({
    client_id: cid,
    client_secret: secret,
    code: input.code,
    redirect_uri: input.redirectUri,
  });
  const res = await fetch(TODOIST_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Todoist token exchange failed (${res.status}): ${text.slice(0, 250)}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  return {
    access_token: typeof json.access_token === "string" ? json.access_token : undefined,
    token_type: "Bearer",
    scope: "data:read_write",
    raw: json,
  };
}
