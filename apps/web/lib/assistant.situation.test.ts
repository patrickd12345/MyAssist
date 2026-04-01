import { describe, expect, it } from "vitest";
import {
  buildFallbackReply,
  buildSituationBriefFallback,
  buildSituationDigest,
} from "./assistant";
import type { MyAssistDailyContext } from "./types";

const contextFixture: MyAssistDailyContext = {
  generated_at: "2026-03-25T03:00:00.000Z",
  run_date: "2026-03-24",
  todoist_overdue: [
    { id: "t1", content: "Renew passport", priority: 1, due: { date: "2026-03-23" } },
    { id: "t2", content: "Submit tax form", priority: 2, due: { date: "2026-03-23" } },
  ],
  todoist_due_today: [{ id: "t3", content: "Prepare for call", priority: 2 }],
  todoist_upcoming_high_priority: [{ id: "t4", content: "Plan Q2 roadmap", priority: 2 }],
  gmail_signals: [
    {
      id: "g1",
      threadId: "th1",
      from: "\"GitHub\" <noreply@github.com>",
      subject: "Token expires soon",
      snippet: "Personal access token is expiring in 5 days.",
      date: "2026-03-24T22:55:14.000Z",
    },
    {
      id: "g2",
      threadId: "th2",
      from: "manager@example.com",
      subject: "Follow-up needed",
      snippet: "Can you send the updated deck?",
      date: "2026-03-24T18:55:14.000Z",
    },
  ],
  calendar_today: [
    {
      id: "c2",
      summary: "Later Event",
      start: "2026-03-25T17:00:00-04:00",
      end: "2026-03-25T17:30:00-04:00",
      location: null,
    },
    {
      id: "c1",
      summary: "First Event",
      start: "2026-03-25T09:00:00-04:00",
      end: "2026-03-25T09:30:00-04:00",
      location: "Room A",
    },
  ],
};

describe("buildSituationDigest", () => {
  it("includes bounded multi-source content with key counts", () => {
    const digest = buildSituationDigest(contextFixture);
    const parsed = JSON.parse(digest) as {
      run_date: string;
      counts: { overdue: number; due_today: number; calendar_events: number; email_signals: number };
      tasks: { overdue: Array<{ content: string }> };
      calendar: Array<{ summary: string }>;
      email_signals: Array<{ from: string; subject: string }>;
    };

    expect(parsed.run_date).toBe("2026-03-24");
    expect(parsed.counts.overdue).toBe(2);
    expect(parsed.counts.due_today).toBe(1);
    expect(parsed.counts.calendar_events).toBe(2);
    expect(parsed.counts.email_signals).toBe(2);
    expect(parsed.tasks.overdue[0].content).toBe("Renew passport");
    expect(parsed.calendar[0].summary).toBe("First Event");
    expect(parsed.email_signals[0].from).toContain("manager");
  });
});

describe("buildSituationBriefFallback", () => {
  it("returns structured fallback fields with actionable content", () => {
    const brief = buildSituationBriefFallback(contextFixture);
    expect(brief.pressure_summary.length).toBeGreaterThan(10);
    expect(brief.top_priorities.length).toBeGreaterThan(0);
    expect(brief.conflicts_and_risks.length).toBeGreaterThan(0);
    expect(brief.defer_recommendations.length).toBeGreaterThan(0);
    expect(brief.next_actions.length).toBeGreaterThan(0);
    expect(brief.confidence_and_limits).toContain("current task");
  });

  it("uses Todoist priority when selecting top task cues", () => {
    const brief = buildSituationBriefFallback({
      ...contextFixture,
      todoist_overdue: [
        { id: "t1", content: "Lower priority overdue", priority: 1, due: { date: "2026-03-23" } },
        { id: "t2", content: "Highest priority overdue", priority: 4, due: { date: "2026-03-23" } },
      ],
      todoist_due_today: [],
      todoist_upcoming_high_priority: [],
    });
    expect(brief.top_priorities[0]).toBe("Highest priority overdue");
  });
});

describe("buildFallbackReply", () => {
  it("references highest-priority task when asked what to prioritize", () => {
    const reply = buildFallbackReply(
      {
        ...contextFixture,
        todoist_overdue: [],
        todoist_due_today: [],
        todoist_upcoming_high_priority: [
          { id: "t9", content: "P4 strategic task", priority: 4 },
          { id: "t8", content: "P3 strategic task", priority: 3 },
        ],
      },
      "What should I prioritize first?",
    );
    expect(reply.answer).toContain("P4 strategic task");
    expect(reply.actions[0]).toBe("P4 strategic task");
  });
});
