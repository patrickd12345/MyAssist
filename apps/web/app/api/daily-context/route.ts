import { type NextRequest, NextResponse } from "next/server";
import { readLastDailyContext, writeLastDailyContext } from "@/lib/dailyContextSnapshot";
import { fetchDailyContextLive, MYASSIST_CONTEXT_SOURCE_HEADER } from "@/lib/fetchDailyContext";
import { integrationService } from "@/lib/integrations/service";
import { getTaskNudges } from "@/lib/memoryStore";
import { getSessionUserId } from "@/lib/session";
import { fetchTodoistTaskRecordsForUser } from "@/lib/todoistApiTasks";
import { buildTodoistIntelligence } from "@/lib/todoistIntelligence";
import { mapTodoistTaskPreview } from "@/lib/todoistPreview";
import { bucketTodoistTasksFromApi, todayCalendarDateInTaskZone } from "@/lib/todoistTaskBuckets";
import type { GmailPhaseBSignal } from "@/lib/integrations/gmailSignalDetection";
import { buildCalendarIntelligence } from "@/lib/calendarIntelligence";
import { mapGoogleCalendarEventsRaw } from "@/lib/calendarPreview";
import { buildDailyIntelligence } from "@/lib/dailyIntelligence";
import { buildUnifiedDailyBriefing } from "@/lib/unifiedDailyBriefing";
import type { MyAssistDailyContext } from "@/lib/types";
import { jsonLegacyApiError } from "@/lib/api/error-contract";

export const dynamic = "force-dynamic";

type DailyContextProviderSlice = "gmail" | "google_calendar" | "todoist";

function isDailyContextProviderSlice(value: string | null): value is DailyContextProviderSlice {
  return value === "gmail" || value === "google_calendar" || value === "todoist";
}

function mapOAuthGmailSignals(raw: Array<Record<string, unknown>>): MyAssistDailyContext["gmail_signals"] {
  return raw.map((g) => {
    const labelRaw = g.label_ids;
    const label_ids =
      Array.isArray(labelRaw) && labelRaw.every((x) => typeof x === "string")
        ? (labelRaw as string[])
        : undefined;
    const phaseRaw = g.phase_b_signals;
    const phase_b_signals =
      Array.isArray(phaseRaw) && phaseRaw.length > 0 ? (phaseRaw as GmailPhaseBSignal[]) : undefined;
    return {
      id: (typeof g.id === "string" ? g.id : null) ?? null,
      threadId: (typeof g.threadId === "string" ? g.threadId : null) ?? null,
      from: typeof g.from === "string" ? g.from : "",
      subject: typeof g.subject === "string" ? g.subject : "",
      snippet: typeof g.snippet === "string" ? g.snippet : "",
      date: typeof g.date === "string" ? g.date : "",
      ...(label_ids ? { label_ids } : {}),
      ...(phase_b_signals ? { phase_b_signals } : {}),
    };
  });
}

async function fetchTodoistSlices(userId: string): Promise<Pick<
  MyAssistDailyContext,
  "todoist_overdue" | "todoist_due_today" | "todoist_upcoming_high_priority"
> & { todoist_intelligence: NonNullable<MyAssistDailyContext["todoist_intelligence"]> } | null> {
  const tasks = await fetchTodoistTaskRecordsForUser(userId);
  if (tasks === null) return null;
  const previews = tasks
    .map((task) => mapTodoistTaskPreview(task))
    .filter((task): task is NonNullable<ReturnType<typeof mapTodoistTaskPreview>> => Boolean(task));
  return {
    ...bucketTodoistTasksFromApi(tasks),
    todoist_intelligence: buildTodoistIntelligence(previews),
  };
}

async function buildProviderSliceResponse(
  provider: DailyContextProviderSlice,
  userId: string,
): Promise<Response> {
  const cached = await readLastDailyContext(userId);
  const fallbackRunDate = cached?.run_date ?? todayCalendarDateInTaskZone(new Date());
  const fallbackGeneratedAt = cached?.generated_at ?? new Date().toISOString();

  if (provider === "gmail") {
    const live = await integrationService.fetchGmailSignals(userId);
    const gmail_signals = live
      ? mapOAuthGmailSignals(live)
      : (cached?.gmail_signals ?? []);
    const daily_intelligence = buildDailyIntelligence(gmail_signals);
    const unified_daily_briefing = await buildUnifiedDailyBriefing({
      generated_at: fallbackGeneratedAt,
      run_date: fallbackRunDate,
      gmail_signals,
      daily_intelligence,
      calendar_today: cached?.calendar_today ?? [],
      calendar_intelligence: cached?.calendar_intelligence,
      todoist_overdue: cached?.todoist_overdue ?? [],
      todoist_due_today: cached?.todoist_due_today ?? [],
      todoist_upcoming_high_priority: cached?.todoist_upcoming_high_priority ?? [],
      todoist_intelligence: cached?.todoist_intelligence,
    });
    return NextResponse.json({
      provider,
      source: live ? "live" : "cache-fallback",
      run_date: fallbackRunDate,
      generated_at: fallbackGeneratedAt,
      gmail_signals,
      daily_intelligence,
      unified_daily_briefing,
    });
  }

  if (provider === "google_calendar") {
    const live = await integrationService.fetchCalendarEvents(userId);
    const calendar_today = Array.isArray(live)
      ? mapGoogleCalendarEventsRaw(live)
      : (cached?.calendar_today ?? []);
    const calendar_intelligence = buildCalendarIntelligence(
      calendar_today,
      Date.now(),
      fallbackRunDate,
    );
    const unified_daily_briefing = await buildUnifiedDailyBriefing({
      generated_at: fallbackGeneratedAt,
      run_date: fallbackRunDate,
      gmail_signals: cached?.gmail_signals ?? [],
      daily_intelligence: cached?.daily_intelligence,
      calendar_today,
      calendar_intelligence,
      todoist_overdue: cached?.todoist_overdue ?? [],
      todoist_due_today: cached?.todoist_due_today ?? [],
      todoist_upcoming_high_priority: cached?.todoist_upcoming_high_priority ?? [],
      todoist_intelligence: cached?.todoist_intelligence,
    });
    return NextResponse.json({
      provider,
      source: live ? "live" : "cache-fallback",
      run_date: fallbackRunDate,
      generated_at: fallbackGeneratedAt,
      calendar_today,
      calendar_intelligence,
      unified_daily_briefing,
    });
  }

  const liveTodoist = await fetchTodoistSlices(userId);
  const todoist_overdue = liveTodoist?.todoist_overdue ?? (cached?.todoist_overdue ?? []);
  const todoist_due_today = liveTodoist?.todoist_due_today ?? (cached?.todoist_due_today ?? []);
  const todoist_upcoming_high_priority =
    liveTodoist?.todoist_upcoming_high_priority ?? (cached?.todoist_upcoming_high_priority ?? []);
  const todoist_intelligence = liveTodoist?.todoist_intelligence ?? cached?.todoist_intelligence;
  const unified_daily_briefing = await buildUnifiedDailyBriefing({
    generated_at: fallbackGeneratedAt,
    run_date: fallbackRunDate,
    gmail_signals: cached?.gmail_signals ?? [],
    daily_intelligence: cached?.daily_intelligence,
    calendar_today: cached?.calendar_today ?? [],
    calendar_intelligence: cached?.calendar_intelligence,
    todoist_overdue,
    todoist_due_today,
    todoist_upcoming_high_priority,
    todoist_intelligence,
  });
  return NextResponse.json({
    provider,
    source: liveTodoist ? "live" : "cache-fallback",
    run_date: fallbackRunDate,
    generated_at: fallbackGeneratedAt,
    todoist_overdue,
    todoist_due_today,
    todoist_upcoming_high_priority,
    todoist_intelligence,
    unified_daily_briefing,
  });
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return jsonLegacyApiError("Unauthorized", 401);
    }

    const fromCache = request.nextUrl.searchParams.get("source") === "cache";
    const provider = request.nextUrl.searchParams.get("provider");
    if (isDailyContextProviderSlice(provider)) {
      return buildProviderSliceResponse(provider, userId);
    }

    if (fromCache) {
      const cached = await readLastDailyContext(userId);
      if (!cached) {
        return jsonLegacyApiError("no_cached_snapshot", 404);
      }
      const nudges = await getTaskNudges(userId);
      let context = { ...cached, user_task_nudges: nudges };
      try {
        const oauthCalendar = await integrationService.fetchCalendarEvents(userId);
        if (Array.isArray(oauthCalendar)) {
          const mapped = mapGoogleCalendarEventsRaw(oauthCalendar);
          if (mapped.length > 0 || context.calendar_today.length === 0) {
            const calendar_intelligence = buildCalendarIntelligence(mapped, Date.now(), context.run_date);
            context = { ...context, calendar_today: mapped, calendar_intelligence };
          }
        }
      } catch {
        // Keep cached context if OAuth refresh fails.
      }
      context = {
        ...context,
        unified_daily_briefing: await buildUnifiedDailyBriefing(context),
      };
      const res = NextResponse.json(context);
      res.headers.set(MYASSIST_CONTEXT_SOURCE_HEADER, "cache");
      return res;
    }

    const { context, source } = await fetchDailyContextLive(userId);

    await writeLastDailyContext(userId, context);

    const nudges = await getTaskNudges(userId);
    context.user_task_nudges = nudges;
    context.unified_daily_briefing = await buildUnifiedDailyBriefing(context);

    const res = NextResponse.json(context);
    res.headers.set(MYASSIST_CONTEXT_SOURCE_HEADER, source);
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonLegacyApiError(String(message), 502);
  }
}
