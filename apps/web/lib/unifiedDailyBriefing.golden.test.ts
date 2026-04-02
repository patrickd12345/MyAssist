import { describe, expect, it, vi } from "vitest";
import { buildUnifiedDailyBriefing } from "./unifiedDailyBriefing";
import type { MyAssistDailyContext } from "./types";

vi.mock("./env/runtime", () => ({
  resolveMyAssistRuntimeEnv: () => ({
    myassistDailyIntelAi: "",
  }),
}));

const goldenFixture: MyAssistDailyContext = {
  generated_at: "2026-04-02T12:00:00.000Z",
  run_date: "2026-04-02",
  todoist_overdue: [
    { content: "Overdue A", priority: 4, id: "1" },
  ],
  todoist_due_today: [
    { content: "Due today B", priority: 2, id: "2" },
  ],
  todoist_upcoming_high_priority: [],
  gmail_signals: [
    {
      id: "m1",
      threadId: "t1",
      from: "recruiter@example.com",
      subject: "Interview next steps",
      snippet: "Please confirm",
      date: "2026-04-02T10:00:00.000Z",
      phase_b_signals: [
        { messageId: "m1", type: "job_interview", confidence: 0.9, reason: "fixture" },
        { messageId: "m1", type: "action_required", confidence: 0.8, reason: "fixture" },
        { messageId: "m1", type: "important", confidence: 0.7, reason: "fixture" },
      ],
    },
  ],
  calendar_today: [
    {
      id: "e1",
      summary: "Acme — interview",
      start: "2026-04-02T14:00:00-04:00",
      end: "2026-04-02T15:00:00-04:00",
      location: null,
    },
  ],
  calendar_intelligence: {
    signals: [],
    summary: "One event today.",
    counts: { eventsInWindow: 1, timedEventsInWindow: 1, minutesUntilNextMeeting: 30 },
  },
  daily_intelligence: {
    urgent: [],
    important: [],
    action_required: [],
    job_related: [],
    calendar_related: [],
    summary: {
      countsByType: {},
      topPriorities: [],
      generatedDeterministicSummary: "2 Gmail signal(s) in context.",
    },
  },
  todoist_intelligence: {
    signals: [],
    counts: { total: 2, overdue: 1, dueToday: 1, highPriority: 1 },
    summary: "Todoist: 1 overdue, 1 due today.",
  },
};

describe("buildUnifiedDailyBriefing golden fixture", () => {
  it("matches stable deterministic slices for briefing lists and counts", async () => {
    const briefing = await buildUnifiedDailyBriefing(goldenFixture);

    expect(briefing.urgent).toEqual(
      expect.arrayContaining([
        "Interview action needed: Interview next steps",
        "Interview today: Acme — interview",
        "Overdue high-priority task: Overdue A",
      ]),
    );
    expect(briefing.schedule_summary).toBe("One event today.");
    expect(briefing.tasks_summary).toBe("Todoist: 1 overdue, 1 due today.");
    expect(briefing.email_summary).toBe("2 Gmail signal(s) in context.");
    expect(briefing.counts.urgent).toBeGreaterThanOrEqual(3);
    expect(briefing.summary).toContain("Urgent");
    expect(briefing.summary).toContain("important");
  });
});
