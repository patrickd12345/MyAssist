import { type NextRequest, NextResponse } from "next/server";
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
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const ctx = (body as Record<string, unknown>).context ?? body;
  if (!isMyAssistDailyContext(ctx)) {
    logServerEvent("warn", "proactive_intelligence_invalid_context", {});
    return NextResponse.json({ ok: false, error: "invalid_context" }, { status: 400 });
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
