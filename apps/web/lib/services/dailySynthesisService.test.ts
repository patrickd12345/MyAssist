import { describe, expect, it } from "vitest";
import type { MyAssistDailyContext } from "@/lib/types";
import { buildDailySynthesis, buildDailySynthesisFromContext } from "./dailySynthesisService";
import { buildJobHuntExpansion } from "./jobHuntExpansionService";
import { buildTodayInsights } from "./todayIntelligenceService";

function base(overrides: Partial<MyAssistDailyContext> = {}): MyAssistDailyContext {
  return {
    generated_at: "2025-06-15T12:00:00.000Z",
    run_date: "2025-06-15",
    todoist_overdue: [],
    todoist_due_today: [],
    todoist_upcoming_high_priority: [],
    gmail_signals: [],
    calendar_today: [],
    ...overrides,
  };
}

describe("dailySynthesisService", () => {
  it("buildDailySynthesisFromContext returns one-line summary and buckets", () => {
    const ctx = base({
      todoist_overdue: [{ id: "o1", content: "Late" }],
    });
    const syn = buildDailySynthesisFromContext(ctx);
    expect(syn.oneLineSummary.length).toBeGreaterThan(10);
    expect(syn.topPriorities.length).toBeGreaterThanOrEqual(1);
    expect(syn.actionNow.some((l) => l.includes("overdue"))).toBe(true);
  });

  it("prioritizes interview language when interview and overdue coexist", () => {
    const ctx = base({
      calendar_today: [
        {
          id: "ev1",
          summary: "Phone screen interview",
          start: "2025-06-15T15:00:00-04:00",
          end: "2025-06-15T16:00:00-04:00",
          location: null,
        },
      ],
      todoist_overdue: [{ id: "o1", content: "Thing" }],
    });
    const insights = buildTodayInsights(ctx);
    const jh = buildJobHuntExpansion(ctx);
    const syn = buildDailySynthesis(ctx, insights, jh);
    expect(syn.oneLineSummary.toLowerCase()).toMatch(/interview/);
    expect(syn.actionNow.some((l) => l.toLowerCase().includes("interview"))).toBe(true);
  });
});
