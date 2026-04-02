import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { jsonLegacyApiError } from "@/lib/api/error-contract";
import { fetchDailyContextLive } from "@/lib/fetchDailyContext";
import { buildMcpActionCandidates } from "@/lib/mcp/buildMcpActionCandidates";
import { mintApprovalToken } from "@/lib/mcp/mcpActionApprovalToken";
import { authenticateMcpRequest } from "@/lib/mcp/mcpBearerAuth";
import { logServerEvent } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

function userIdLogHash(userId: string): string {
  return crypto.createHash("sha256").update(userId).digest("hex").slice(0, 8);
}

/**
 * Mints a short-lived approval token for an action_id that appears in the current candidate list.
 */
export async function POST(request: NextRequest) {
  const auth = authenticateMcpRequest(request);
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonLegacyApiError("Invalid JSON body.", 400);
  }
  const actionId =
    body && typeof body === "object" && typeof (body as { action_id?: unknown }).action_id === "string"
      ? (body as { action_id: string }).action_id.trim()
      : "";
  if (!actionId) {
    return jsonLegacyApiError("action_id is required.", 400);
  }

  try {
    const { context } = await fetchDailyContextLive(userId);
    const { candidates } = buildMcpActionCandidates(context);
    const allowed = candidates.some((c) => c.action_id === actionId);
    if (!allowed) {
      logServerEvent("warn", "mcp_action_approve_rejected", {
        user_id_hash: userIdLogHash(userId),
        reason: "not_in_candidate_set",
      });
      return jsonLegacyApiError("action_id is not in the current candidate list.", 400);
    }

    const minted = mintApprovalToken(userId, actionId);
    logServerEvent("info", "mcp_action_approve_minted", {
      user_id_hash: userIdLogHash(userId),
      action_kind: "complete_task",
    });
    return NextResponse.json(minted);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    logServerEvent("warn", "mcp_action_approve_error", {
      user_id_hash: userIdLogHash(userId),
      message: String(message).slice(0, 200),
    });
    return jsonLegacyApiError(String(message), 502);
  }
}
