import type { MyAssistDailyContext } from "./types";

/**
 * Compact structured block for assistant prompts (no raw inbox dump).
 * Returns null when `daily_intelligence` is absent on the snapshot.
 */
export function buildDailyIntelligencePromptBlock(
  context: MyAssistDailyContext,
): Record<string, unknown> | null {
  const di = context.daily_intelligence;
  if (!di) return null;

  const out: Record<string, unknown> = {
    bucket_counts: {
      urgent: di.urgent.length,
      important: di.important.length,
      action_required: di.action_required.length,
      job_related: di.job_related.length,
      calendar_related: di.calendar_related.length,
    },
    counts_by_type: di.summary.countsByType,
    top_priorities: di.summary.topPriorities.slice(0, 5),
    deterministic_summary: di.summary.generatedDeterministicSummary,
  };

  const ai = di.summary.aiSummary?.trim();
  if (ai) {
    out.ai_summary = ai;
  }

  return out;
}
