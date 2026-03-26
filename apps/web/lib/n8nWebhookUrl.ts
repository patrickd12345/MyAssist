import "server-only";

import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";

export type N8nIntegrationOverrides = {
  webhookUrl?: string | null;
  webhookToken?: string | null;
};

function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split(".").map((x) => Number.parseInt(x, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateOrReservedIPv6(ip: string): boolean {
  const lowered = ip.toLowerCase();
  if (lowered === "::1") return true;
  if (lowered.startsWith("fe80:")) return true;
  if (lowered.startsWith("fc") || lowered.startsWith("fd")) return true;
  if (lowered.startsWith("::ffff:")) {
    const v4 = lowered.slice(7);
    return isPrivateOrReservedIPv4(v4);
  }
  return false;
}

function isNonPublicIp(ip: string): boolean {
  if (isIPv4(ip)) return isPrivateOrReservedIPv4(ip);
  if (isIPv6(ip)) return isPrivateOrReservedIPv6(ip);
  return true;
}

function envWebhookOrigin(): string | null {
  const raw = process.env.MYASSIST_N8N_WEBHOOK_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Per-user webhook overrides must target the same origin as MYASSIST_N8N_WEBHOOK_URL
 * so arbitrary hosts cannot be reached via stored profile data (SSRF).
 */
function assertUserOverrideMatchesEnvOrigin(url: URL, overrides?: N8nIntegrationOverrides | null): void {
  const userUrl = overrides?.webhookUrl?.trim();
  if (!userUrl) return;
  const expected = envWebhookOrigin();
  if (!expected) {
    throw new Error(
      "Per-user n8n webhook URL requires MYASSIST_N8N_WEBHOOK_URL to be set for same-origin validation.",
    );
  }
  if (url.origin !== expected) {
    throw new Error("n8n webhook URL must match the origin configured in MYASSIST_N8N_WEBHOOK_URL.");
  }
}

async function assertHostnameResolvesToPublicAddress(hostname: string): Promise<void> {
  if (isIPv4(hostname) || isIPv6(hostname)) {
    if (isNonPublicIp(hostname)) {
      throw new Error("n8n webhook URL must not target private, loopback, or link-local addresses.");
    }
    return;
  }

  let results: { address: string; family: number }[];
  try {
    results = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("n8n webhook hostname could not be resolved.");
  }
  if (results.length === 0) {
    throw new Error("n8n webhook hostname could not be resolved.");
  }
  for (const r of results) {
    if (isNonPublicIp(r.address)) {
      throw new Error("n8n webhook hostname resolves to a non-public address.");
    }
  }
}

function shouldAllowLocalWebhookHost(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const v = process.env.MYASSIST_ALLOW_LOCAL_N8N_WEBHOOK?.trim().toLowerCase();
  return v === "true" || v === "1";
}

/**
 * Validates the webhook URL before server-side fetch to mitigate SSRF.
 * Call this for every resolved URL (env or per-user override).
 *
 * In `next dev` (NODE_ENV=development), localhost/LAN URLs are allowed so local n8n works.
 * Production and `next start` require a public hostname unless MYASSIST_ALLOW_LOCAL_N8N_WEBHOOK=true.
 */
export async function assertSafeN8nWebhookUrl(
  urlString: string,
  overrides?: N8nIntegrationOverrides | null,
): Promise<void> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("Invalid n8n webhook URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("n8n webhook URL must use http or https.");
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("n8n webhook URL must not embed credentials.");
  }

  assertUserOverrideMatchesEnvOrigin(url, overrides);

  if (!shouldAllowLocalWebhookHost()) {
    await assertHostnameResolvesToPublicAddress(url.hostname);
  }
}
