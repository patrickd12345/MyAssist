import { describe, expect, it } from "vitest";
import type { MyAssistDailyContext } from "@/lib/types";
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

describe("todayIntelligenceService", () => {
  it("adds priority when an interview-like calendar event is on run_date", () => {
    const ctx = base({
      calendar_today: [
        {
          id: "ev-int",
          summary: "Technical interview — ACME",
          start: "2025-06-15T14:00:00-04:00",
          end: "2025-06-15T15:00:00-04:00",
          location: "Zoom",
        },
      ],
    });
    const { priorities } = buildTodayInsights(ctx);
    expect(priorities.some((p) => p.id.startsWith("priority-interview-"))).toBe(true);
    expect(priorities.find((p) => p.id.startsWith("priority-interview-"))?.severity).toBe("high");
  });

  it("adds priority when there are overdue tasks", () => {
    const ctx = base({
      todoist_overdue: [{ id: "t1", content: "Finish report" }],
    });
    const { priorities } = buildTodayInsights(ctx);
    const overdue = priorities.find((p) => p.id === "priority-overdue-tasks");
    expect(overdue).toBeDefined();
    expect(overdue?.title).toContain("overdue");
    expect(overdue?.description).toContain("Finish report");
  });

  it("adds follow-up when Gmail signal has follow_up job-hunt analysis", () => {
    const ctx = base({
      gmail_signals: [
        {
          id: "g1",
          threadId: "th-follow",
          from: "recruiter@example.com",
          subject: "Re: your application",
          snippet: "Just following up on next steps for the backend role.",
          date: "2025-06-15T09:00:00.000Z",
          job_hunt_analysis: {
            signals: ["follow_up"],
            confidence: 0.6,
            suggestedActions: ["create_followup_task"],
          },
        },
      ],
    });
    const { followUps } = buildTodayInsights(ctx);
    expect(followUps.length).toBeGreaterThanOrEqual(1);
    expect(followUps.some((f) => f.title.includes("Follow up"))).toBe(true);
  });

  it("detects overlapping timed calendar events as risk", () => {
    const ctx = base({
      calendar_today: [
        {
          id: "a",
          summary: "Meeting A",
          start: "2025-06-15T10:00:00-04:00",
          end: "2025-06-15T11:00:00-04:00",
          location: null,
        },
        {
          id: "b",
          summary: "Meeting B",
          start: "2025-06-15T10:30:00-04:00",
          end: "2025-06-15T11:30:00-04:00",
          location: null,
        },
      ],
    });
    const { risks } = buildTodayInsights(ctx);
    expect(risks.some((r) => r.id.startsWith("risk-cal-conflict-"))).toBe(true);
  });
});
