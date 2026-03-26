import { type NextRequest, NextResponse } from "next/server";
import { readLastDailyContext, writeLastDailyContext } from "@/lib/dailyContextSnapshot";
import {
  fetchDailyContextFromN8n,
  MYASSIST_CONTEXT_SOURCE_HEADER,
  type N8nIntegrationOverrides,
} from "@/lib/fetchDailyContext";
import { getTaskNudges } from "@/lib/memoryStore";
import { getSessionUserId } from "@/lib/session";
import { getUserById } from "@/lib/userStore";

export const dynamic = "force-dynamic";

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
      const context = { ...cached, user_task_nudges: nudges };
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
