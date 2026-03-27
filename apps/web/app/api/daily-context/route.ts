import { type NextRequest, NextResponse } from "next/server";
import { readLastDailyContext, writeLastDailyContext } from "@/lib/dailyContextSnapshot";
import { fetchDailyContextLive, MYASSIST_CONTEXT_SOURCE_HEADER } from "@/lib/fetchDailyContext";
import { integrationService } from "@/lib/integrations/service";
import { getTaskNudges } from "@/lib/memoryStore";
import { getSessionUserId } from "@/lib/session";
import { resolveTodoistApiToken } from "@/lib/todoistToken";
import { bucketTodoistTasksFromApi, todayCalendarDateInTaskZone } from "@/lib/todoistTaskBuckets";
import type { MyAssistDailyContext } from "@/lib/types";

export const dynamic = "force-dynamic";

function mapOAuthCalendarEvents(raw: Array<Record<string, unknown>>): MyAssistDailyContext["calendar_today"] {
  return raw.map((e) => {
    const startObj = (e.start as Record<string, unknown> | undefined) || {};
    const endObj = (e.end as Record<string, unknown> | undefined) || {};
    return {
      id: typeof e.id === "string" ? e.id : null,
      summary: typeof e.summary === "string" ? e.summary : "(untitled event)",
      start:
        (typeof startObj.dateTime === "string" && startObj.dateTime) ||
        (typeof startObj.date === "string" && startObj.date) ||
        null,
      end:
        (typeof endObj.dateTime === "string" && endObj.dateTime) ||
        (typeof endObj.date === "string" && endObj.date) ||
        null,
      location: typeof e.location === "string" ? e.location : null,
    };
  });
}

type DailyContextProviderSlice = "gmail" | "google_calendar" | "todoist";

function isDailyContextProviderSlice(value: string | null): value is DailyContextProviderSlice {
  return value === "gmail" || value === "google_calendar" || value === "todoist";
}

function mapOAuthGmailSignals(raw: Array<Record<string, unknown>>): MyAssistDailyContext["gmail_signals"] {
  return raw.map((g) => ({
    id: (typeof g.id === "string" ? g.id : null) ?? null,
    threadId: (typeof g.threadId === "string" ? g.threadId : null) ?? null,
    from: typeof g.from === "string" ? g.from : "",
    subject: typeof g.subject === "string" ? g.subject : "",
    snippet: typeof g.snippet === "string" ? g.snippet : "",
    date: typeof g.date === "string" ? g.date : "",
  }));
}

async function fetchTodoistSlices(userId: string): Promise<Pick<
  MyAssistDailyContext,
  "todoist_overdue" | "todoist_due_today" | "todoist_upcoming_high_priority"
> | null> {
  const token = await resolveTodoistApiToken(userId);
  if (!token) return null;
  const res = await fetch("https://api.todoist.com/api/v1/tasks?limit=200", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as unknown;
  if (!Array.isArray(json)) return null;
  const tasks = json.filter(
    (item): item is Record<string, unknown> => Boolean(item && typeof item === "object"),
  );

  return bucketTodoistTasksFromApi(tasks);
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
    return NextResponse.json({
      provider,
      source: live ? "live" : "cache-fallback",
      run_date: fallbackRunDate,
      generated_at: fallbackGeneratedAt,
      gmail_signals: live
        ? mapOAuthGmailSignals(live)
        : (cached?.gmail_signals ?? []),
    });
  }

  if (provider === "google_calendar") {
    const live = await integrationService.fetchCalendarEvents(userId);
    return NextResponse.json({
      provider,
      source: live ? "live" : "cache-fallback",
      run_date: fallbackRunDate,
      generated_at: fallbackGeneratedAt,
      calendar_today: Array.isArray(live)
        ? mapOAuthCalendarEvents(live)
        : (cached?.calendar_today ?? []),
    });
  }

  const liveTodoist = await fetchTodoistSlices(userId);
  return NextResponse.json({
    provider,
    source: liveTodoist ? "live" : "cache-fallback",
    run_date: fallbackRunDate,
    generated_at: fallbackGeneratedAt,
    todoist_overdue: liveTodoist?.todoist_overdue ?? (cached?.todoist_overdue ?? []),
    todoist_due_today: liveTodoist?.todoist_due_today ?? (cached?.todoist_due_today ?? []),
    todoist_upcoming_high_priority:
      liveTodoist?.todoist_upcoming_high_priority ?? (cached?.todoist_upcoming_high_priority ?? []),
  });
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const fromCache = request.nextUrl.searchParams.get("source") === "cache";
    const provider = request.nextUrl.searchParams.get("provider");
    if (isDailyContextProviderSlice(provider)) {
      return buildProviderSliceResponse(provider, userId);
    }

    if (fromCache) {
      const cached = await readLastDailyContext(userId);
      if (!cached) {
        return NextResponse.json({ error: "no_cached_snapshot" }, { status: 404 });
      }
      const nudges = await getTaskNudges(userId);
      let context = { ...cached, user_task_nudges: nudges };
      try {
        const oauthCalendar = await integrationService.fetchCalendarEvents(userId);
        if (Array.isArray(oauthCalendar)) {
          const mapped = mapOAuthCalendarEvents(oauthCalendar);
          if (mapped.length > 0 || context.calendar_today.length === 0) {
            context = { ...context, calendar_today: mapped };
          }
        }
      } catch {
        // Keep cached context if OAuth refresh fails.
      }
      const res = NextResponse.json(context);
      res.headers.set(MYASSIST_CONTEXT_SOURCE_HEADER, "cache");
      return res;
    }

    const { context, source } = await fetchDailyContextLive(userId);

    await writeLastDailyContext(userId, context);

    const nudges = await getTaskNudges(userId);
    context.user_task_nudges = nudges;

    const res = NextResponse.json(context);
    res.headers.set(MYASSIST_CONTEXT_SOURCE_HEADER, source);
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
