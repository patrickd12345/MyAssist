import { type NextRequest, NextResponse } from "next/server";
import { getApiRequestId, jsonApiError } from "@/lib/api/error-contract";
import { buildDailySynthesis } from "@/lib/services/dailySynthesisService";
import { buildJobHuntExpansion } from "@/lib/services/jobHuntExpansionService";
import { buildProactiveIntelligence } from "@/lib/services/proactiveIntelligenceService";
import { buildTodayInsights } from "@/lib/services/todayIntelligenceService";
import { readLastDashboardVisit, writeLastDashboardVisit } from "@/lib/proactiveVisitStore";
import { logServerEvent } from "@/lib/serverLog";
import { getSessionUserId } from "@/lib/session";
import type { MyAssistDailyContext } from "@/lib/types";
import { isMyAssistDailyContext } from "@/lib/validateContext";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const requestId = getApiRequestId(request);
  const userId = await getSessionUserId();
  if (!userId) {
    return jsonApiError("unauthorized", "Unauthorized", 401, requestId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonApiError("invalid_json", "Invalid JSON", 400, requestId);
  }

  if (!body || typeof body !== "object") {
    return jsonApiError("invalid_body", "Expected JSON object", 400, requestId);
  }

  const ctx = (body as Record<string, unknown>).context ?? body;
  if (!isMyAssistDailyContext(ctx)) {
    logServerEvent("warn", "proactive_intelligence_invalid_context", { requestId });
    return jsonApiError("invalid_context", "Invalid daily context format", 400, requestId);
  }

  const currentContext = ctx as MyAssistDailyContext;
  const previous = await readLastDashboardVisit(userId);
  const nowMs = Date.now();

  const todayInsights = buildTodayInsights(currentContext);
  const jobHunt = buildJobHuntExpansion(currentContext, nowMs);
  const synthesis = buildDailySynthesis(currentContext, todayInsights, jobHunt);

  const result = buildProactiveIntelligence({
    previousSnapshot: previous?.snapshot ?? null,
    lastVisitAt: previous?.updated_at ?? null,
    currentContext,
    nowMs,
    dailySynthesis: synthesis,
    todayInsights,
    jobHunt,
  });

  let persistWarning: string | undefined;
  try {
    await writeLastDashboardVisit(userId, currentContext);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "visit_snapshot_write_failed";
    persistWarning = message;
    logServerEvent("warn", "proactive_visit_persist_failed", {
      error: message.slice(0, 200),
    });
  }

  return NextResponse.json({
    ok: true,
    ...result,
    ...(persistWarning ? { persistWarning } : {}),
  });
}
