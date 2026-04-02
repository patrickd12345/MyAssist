import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { jsonLegacyApiError } from "@/lib/api/error-contract";
import { parseMcpExecutableActionId, verifyApprovalToken } from "@/lib/mcp/mcpActionApprovalToken";
import { authenticateMcpRequest } from "@/lib/mcp/mcpBearerAuth";
import { createCrossSystemActionService } from "@/lib/services/crossSystemActionService";
import { logServerEvent } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

function userIdLogHash(userId: string): string {
  return crypto.createHash("sha256").update(userId).digest("hex").slice(0, 8);
}

/**
 * Executes a gated MCP action after a valid approval_token (see POST /api/mcp/approve).
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
  const record = body as { action_id?: unknown; approval_token?: unknown };
  const actionId = typeof record.action_id === "string" ? record.action_id.trim() : "";
  const approvalToken = typeof record.approval_token === "string" ? record.approval_token.trim() : "";
  if (!actionId || !approvalToken) {
    return jsonLegacyApiError("action_id and approval_token are required.", 400);
  }

  const verified = verifyApprovalToken(userId, actionId, approvalToken);
  if (!verified.ok) {
    logServerEvent("warn", "mcp_action_execute_token_rejected", {
      user_id_hash: userIdLogHash(userId),
      reason: verified.reason,
    });
    return jsonLegacyApiError("Invalid or expired approval_token.", 400);
  }

  const parsed = parseMcpExecutableActionId(actionId);
  if (!parsed) {
    return jsonLegacyApiError("Unsupported action_id for MCP execution.", 400);
  }

  try {
    const service = createCrossSystemActionService(userId);
    const result =
      parsed.kind === "complete_task"
        ? await service.completeTask(parsed.sourceId)
        : await service.emailToTask(parsed.sourceId);
    logServerEvent("info", "mcp_action_execute_ok", {
      user_id_hash: userIdLogHash(userId),
      kind: parsed.kind,
      ok: result.ok !== false,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    logServerEvent("warn", "mcp_action_execute_error", {
      user_id_hash: userIdLogHash(userId),
      message: String(message).slice(0, 200),
    });
    return jsonLegacyApiError(String(message), 502);
  }
}
