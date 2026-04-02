import { type NextRequest, NextResponse } from "next/server";
import { writeLastDailyContext } from "@/lib/dailyContextSnapshot";
import { fetchDailyContextLive, MYASSIST_CONTEXT_SOURCE_HEADER } from "@/lib/fetchDailyContext";
import { getTaskNudges } from "@/lib/memoryStore";
import { buildGoodMorningMessage } from "@/lib/goodMorning";
import { buildUnifiedDailyBriefing } from "@/lib/unifiedDailyBriefing";
import { jsonLegacyApiError } from "@/lib/api/error-contract";
import { logKpiMcpDailyContext } from "@/lib/productKpi";
import { authenticateMcpRequest } from "@/lib/mcp/mcpBearerAuth";

export const dynamic = "force-dynamic";

/**
 * Bearer-authenticated daily context for MCP and other agent clients.
 * Configure MYASSIST_MCP_TOKEN and MYASSIST_MCP_USER_ID (single-user / prototype).
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const auth = authenticateMcpRequest(request);
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  try {
    const { context, source } = await fetchDailyContextLive(userId);
    const nudges = await getTaskNudges(userId);
    context.user_task_nudges = nudges;
    const unified_daily_briefing = await buildUnifiedDailyBriefing(context);
    context.unified_daily_briefing = unified_daily_briefing;
    context.good_morning_message = await buildGoodMorningMessage(unified_daily_briefing);

    if (source !== "demo") {
      await writeLastDailyContext(userId, context);
    }

    const res = NextResponse.json(context);
    res.headers.set(MYASSIST_CONTEXT_SOURCE_HEADER, source);
    logKpiMcpDailyContext({ duration_ms: Date.now() - startedAt, ok: true });
    return res;
  } catch (e) {
    logKpiMcpDailyContext({ duration_ms: Date.now() - startedAt, ok: false });
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonLegacyApiError(String(message), 502);
  }
}
