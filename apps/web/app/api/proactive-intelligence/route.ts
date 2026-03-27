import { type NextRequest, NextResponse } from "next/server";
import { buildDailySynthesis } from "@/lib/services/dailySynthesisService";
import { buildJobHuntExpansion } from "@/lib/services/jobHuntExpansionService";
import { buildProactiveIntelligence } from "@/lib/services/proactiveIntelligenceService";
import { buildTodayInsights } from "@/lib/services/todayIntelligenceService";
import { readLastDashboardVisit, writeLastDashboardVisit } from "@/lib/proactiveVisitStore";
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

  await writeLastDashboardVisit(userId, currentContext);

  return NextResponse.json({ ok: true, ...result });
}
