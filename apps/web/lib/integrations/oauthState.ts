import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import type { IntegrationProvider } from "./types";

type OAuthStatePayload = {
  u: string;
  p: IntegrationProvider;
  t: number;
  n: string;
};

function secret(): string {
  return process.env.AUTH_SECRET?.trim() || "myassist-oauth-state-secret";
}

export function createOAuthState(userId: string, provider: IntegrationProvider): string {
  const payload: OAuthStatePayload = {
    u: userId,
    p: provider,
    t: Date.now(),
    n: randomBytes(8).toString("hex"),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyOAuthState(
  state: string,
  expectedProvider: IntegrationProvider,
  maxAgeMs = 10 * 60 * 1000,
): { userId: string } {
  const [body, sig] = state.split(".");
  if (!body || !sig) throw new Error("Invalid OAuth state");
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  if (expected !== sig) throw new Error("Invalid OAuth state signature");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthStatePayload;
  if (payload.p !== expectedProvider) throw new Error("OAuth state provider mismatch");
  if (Date.now() - payload.t > maxAgeMs) throw new Error("OAuth state expired");
  return { userId: payload.u };
}
