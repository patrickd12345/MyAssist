import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type McpClientEntry = {
  bearerToken: string;
  userId: string;
};

function timingSafeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function parseClientEntriesJson(raw: string): McpClientEntry[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: McpClientEntry[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const bearerToken = typeof o.bearerToken === "string" ? o.bearerToken.trim() : "";
    const userId = typeof o.userId === "string" ? o.userId.trim() : "";
    if (bearerToken && userId) out.push({ bearerToken, userId });
  }
  return out;
}

/**
 * Loads optional multi-client MCP config: `[{ "bearerToken": "...", "userId": "..." }, ...]`.
 * `MYASSIST_MCP_CLIENTS_JSON` takes precedence over `MYASSIST_MCP_CLIENTS_FILE`.
 * Returns `null` when neither is set (caller uses legacy MYASSIST_MCP_TOKEN + MYASSIST_MCP_USER_ID).
 * Returns a (possibly empty) array when configured — empty means fall back to legacy.
 */
export function loadMcpClientEntriesFromEnv(): McpClientEntry[] | null {
  const rawJson = process.env.MYASSIST_MCP_CLIENTS_JSON;
  if (rawJson !== undefined) {
    const jsonEnv = rawJson.trim();
    if (jsonEnv) {
      return parseClientEntriesJson(jsonEnv);
    }
  }
  const fileEnv = process.env.MYASSIST_MCP_CLIENTS_FILE?.trim();
  if (fileEnv) {
    const abs = path.isAbsolute(fileEnv) ? fileEnv : path.resolve(process.cwd(), fileEnv);
    try {
      const raw = fs.readFileSync(abs, "utf8");
      return parseClientEntriesJson(raw);
    } catch {
      return [];
    }
  }
  return null;
}

/**
 * When multi-client config has at least one entry, resolves `bearer` to `userId` with timing-safe comparison.
 * Returns `null` if multi-client mode is not active (use legacy auth).
 */
export function resolveMcpUserFromClientList(bearer: string): { userId: string } | "no_match" | "legacy" {
  const entries = loadMcpClientEntriesFromEnv();
  if (entries === null || entries.length === 0) {
    return "legacy";
  }
  for (const e of entries) {
    if (timingSafeEqualString(bearer, e.bearerToken)) {
      return { userId: e.userId };
    }
  }
  return "no_match";
}

/** Stable string for hashing into MYASSIST_ACTION_APPROVAL_SECRET fallback when using client list without MYASSIST_MCP_TOKEN. */
export function getMcpClientsConfigMaterialForApprovalSecret(): string | null {
  const json = process.env.MYASSIST_MCP_CLIENTS_JSON?.trim();
  if (json) {
    return `clientsJson:${json}`;
  }
  const fp = process.env.MYASSIST_MCP_CLIENTS_FILE?.trim();
  if (fp) {
    try {
      const abs = path.isAbsolute(fp) ? fp : path.resolve(process.cwd(), fp);
      const raw = fs.readFileSync(abs, "utf8");
      return `clientsFile:${raw}`;
    } catch {
      return null;
    }
  }
  return null;
}
