import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { jsonLegacyApiError } from "@/lib/api/error-contract";
import { fetchDailyContextLive } from "@/lib/fetchDailyContext";
import { buildMcpActionCandidates } from "@/lib/mcp/buildMcpActionCandidates";
import { authenticateMcpRequest } from "@/lib/mcp/mcpBearerAuth";
import { logServerEvent } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

function userIdLogHash(userId: string): string {
  return crypto.createHash("sha256").update(userId).digest("hex").slice(0, 8);
}

/**
 * Bearer-authenticated list of MCP action candidates (v1: Todoist complete_task for overdue + due today).
 */
export async function GET(request: NextRequest) {
  const auth = authenticateMcpRequest(request);
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  try {
    const { context } = await fetchDailyContextLive(userId);
    const body = buildMcpActionCandidates(context);
    logServerEvent("info", "mcp_action_candidates_list", {
      user_id_hash: userIdLogHash(userId),
      count: body.candidates.length,
    });
    return NextResponse.json(body);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    logServerEvent("warn", "mcp_action_candidates_error", {
      user_id_hash: userIdLogHash(userId),
      message: String(message).slice(0, 200),
    });
    return jsonLegacyApiError(String(message), 502);
  }
}
