import { type NextRequest, NextResponse } from "next/server";
import { readLastDailyContext, writeLastDailyContext } from "@/lib/dailyContextSnapshot";
import {
  fetchDailyContextFromN8n,
  MYASSIST_CONTEXT_SOURCE_HEADER,
  type N8nIntegrationOverrides,
} from "@/lib/fetchDailyContext";
import { integrationService } from "@/lib/integrations/service";
import { getTaskNudges } from "@/lib/memoryStore";
import { getSessionUserId } from "@/lib/session";
import { getUserById } from "@/lib/userStore";
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

export async function GET(request: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const fromCache = request.nextUrl.searchParams.get("source") === "cache";

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

    const user = await getUserById(userId);
    const n8nIntegration: N8nIntegrationOverrides | undefined =
      user && (user.n8nWebhookUrl?.trim() || user.n8nWebhookToken?.trim())
        ? {
            webhookUrl: user.n8nWebhookUrl,
            webhookToken: user.n8nWebhookToken,
          }
        : undefined;

    const { context, source } = await fetchDailyContextFromN8n(n8nIntegration, userId);

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
