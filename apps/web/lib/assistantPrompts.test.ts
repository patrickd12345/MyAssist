import { describe, expect, it } from "vitest";
import type { MyAssistDailyContext } from "@/lib/types";
import { buildChiefOfStaffFollowUps } from "./assistantPrompts";

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

describe("buildChiefOfStaffFollowUps", () => {
  it("returns light-day prompts when snapshot has no urgent work", () => {
    const followUps = buildChiefOfStaffFollowUps(base());
    expect(followUps).toHaveLength(2);
    expect(followUps[0].toLowerCase()).toContain("focus");
  });

  it("returns heavy-day prompts when urgent task count is high", () => {
    const overdue = Array.from({ length: 6 }, (_, i) => ({
      id: `o${i}`,
      content: `Task ${i}`,
    }));
    const followUps = buildChiefOfStaffFollowUps(base({ todoist_overdue: overdue }));
    expect(followUps[0].toLowerCase()).toMatch(/outcome|must/);
  });

  it("prioritizes action-required briefing when counts are elevated", () => {
    const followUps = buildChiefOfStaffFollowUps(
      base({
        unified_daily_briefing: {
          urgent: [],
          important: [],
          action_required: ["Reply to vendor", "Confirm interview"],
          job_related: [],
          calendar_events_in_view: 0,
          schedule_summary: "",
          tasks_summary: "",
          email_summary: "",
          summary: "",
          counts: { urgent: 0, important: 0, action_required: 2, job_related: 0 },
        },
      }),
    );
    expect(followUps[0].toLowerCase()).toContain("action-required");
  });
});
