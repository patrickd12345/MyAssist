import type { MyAssistDailyContext } from "./types";

/**
 * Compact calendar intelligence for assistant prompts (bounded signals, no raw ICS).
 */
export function buildCalendarIntelligencePromptBlock(
  context: MyAssistDailyContext,
): Record<string, unknown> | null {
  const ci = context.calendar_intelligence;
  if (!ci) return null;

  return {
    summary: ci.summary,
    counts: ci.counts,
    signal_types: ci.signals.map((s) => s.type),
    signal_details: ci.signals.slice(0, 8).map((s) => ({
      type: s.type,
      detail: s.detail,
    })),
  };
}
