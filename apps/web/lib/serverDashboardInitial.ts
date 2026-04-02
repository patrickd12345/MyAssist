import "server-only";

import { readLastDailyContext } from "@/lib/dailyContextSnapshot";
import { buildGoodMorningMessage } from "@/lib/goodMorning";
import { getTaskNudges } from "@/lib/memoryStore";
import type { DailyContextSource } from "@/lib/dailyContextShared";
import { buildUnifiedDailyBriefing } from "@/lib/unifiedDailyBriefing";
import type { MyAssistDailyContext } from "@/lib/types";

export type DashboardServerInitial = {
  initialData: MyAssistDailyContext | null;
  initialError: string | null;
  initialSource: DailyContextSource;
};

/**
 * Hydrate the Today dashboard from the last on-disk snapshot so the first paint is not an empty skeleton.
 * Client-side `loadCachedSnapshot` still runs when `initialData` is null (no snapshot yet).
 */
export async function getDashboardServerInitial(userId: string): Promise<DashboardServerInitial> {
  try {
    const cached = await readLastDailyContext(userId);
    if (!cached) {
      return { initialData: null, initialError: null, initialSource: "live" };
    }
    const nudges = await getTaskNudges(userId);
    const context: MyAssistDailyContext = { ...cached, user_task_nudges: nudges };
    const unified_daily_briefing = await buildUnifiedDailyBriefing(context);
    context.unified_daily_briefing = unified_daily_briefing;
    context.good_morning_message = await buildGoodMorningMessage(unified_daily_briefing);
    return {
      initialData: context,
      initialError: null,
      initialSource: "cache",
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load saved snapshot";
    return { initialData: null, initialError: message, initialSource: "live" };
  }
}
