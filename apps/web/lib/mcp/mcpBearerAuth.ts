import "server-only";

import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { jsonLegacyApiError } from "@/lib/api/error-contract";
import { resolveMcpUserFromClientList } from "@/lib/mcp/mcpClientEntries";

export function readBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export type McpBearerAuthOk = { userId: string };
export type McpBearerAuthFail = { error: NextResponse };

/**
 * Validates `Authorization: Bearer` for MCP routes.
 * When `MYASSIST_MCP_CLIENTS_JSON` or `MYASSIST_MCP_CLIENTS_FILE` defines a non-empty client list,
 * matches bearer to `{ bearerToken, userId }` entries (timing-safe).
 * Otherwise uses legacy `MYASSIST_MCP_TOKEN` + `MYASSIST_MCP_USER_ID`.
 */
export function authenticateMcpRequest(request: NextRequest): McpBearerAuthOk | McpBearerAuthFail {
  const bearer = readBearerToken(request);
  if (!bearer) {
    return { error: jsonLegacyApiError("Unauthorized", 401) };
  }

  const resolved = resolveMcpUserFromClientList(bearer);
  if (resolved === "no_match") {
    return { error: jsonLegacyApiError("Unauthorized", 401) };
  }
  if (resolved !== "legacy") {
    return { userId: resolved.userId };
  }

  const expected = process.env.MYASSIST_MCP_TOKEN?.trim();
  const userId = process.env.MYASSIST_MCP_USER_ID?.trim();
  if (!expected || !userId) {
    return {
      error: jsonLegacyApiError(
        "MCP is not configured (set MYASSIST_MCP_TOKEN and MYASSIST_MCP_USER_ID, or MYASSIST_MCP_CLIENTS_JSON / MYASSIST_MCP_CLIENTS_FILE).",
        503,
        {
          code: "mcp_not_configured",
        },
      ),
    };
  }

  if (!timingSafeEqualString(bearer, expected)) {
    return { error: jsonLegacyApiError("Unauthorized", 401) };
  }

  return { userId };
}
