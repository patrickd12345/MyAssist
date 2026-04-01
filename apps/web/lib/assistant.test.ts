import { describe, expect, it } from "vitest";
import type { MyAssistDailyContext } from "@/lib/types";
import { buildSuggestedPrompts, buildWelcomeReply } from "./assistant";

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

describe("buildSuggestedPrompts", () => {
  it("keeps three baseline prompts first when no extra context", () => {
    const prompts = buildSuggestedPrompts(base());
    expect(prompts.slice(0, 3)).toEqual([
      "What should I focus on first today?",
      "What can I safely defer?",
      "Summarize my day like a chief of staff.",
    ]);
    expect(prompts.length).toBeLessThanOrEqual(5);
  });

  it("adds action-required prompt when unified briefing has action_required count", () => {
    const prompts = buildSuggestedPrompts(
      base({
        unified_daily_briefing: {
          urgent: [],
          important: [],
          action_required: ["Sign contract"],
          job_related: [],
          calendar_events_in_view: 0,
          schedule_summary: "",
          tasks_summary: "",
          email_summary: "",
          summary: "",
          counts: { urgent: 0, important: 0, action_required: 1, job_related: 0 },
        },
      }),
    );
    expect(prompts.some((p) => p.includes("action-required"))).toBe(true);
  });

  it("dedupes duplicate lines", () => {
    const prompts = buildSuggestedPrompts(
      base({
        unified_daily_briefing: {
          urgent: [],
          important: [],
          action_required: [],
          job_related: [],
          calendar_events_in_view: 0,
          schedule_summary: "",
          tasks_summary: "",
          email_summary: "",
          summary: "",
          counts: { urgent: 0, important: 0, action_required: 0, job_related: 0 },
        },
      }),
    );
    const lower = prompts.map((p) => p.toLowerCase());
    expect(lower.length).toBe(new Set(lower).size);
  });
});

describe("buildWelcomeReply", () => {
  it("notes thin snapshot when tasks, calendar, and gmail are empty", () => {
    const reply = buildWelcomeReply(base());
    expect(reply.answer).toMatch(/thin/i);
    expect(reply.followUps).toHaveLength(2);
  });

  it("includes follow-ups when there is overdue work", () => {
    const reply = buildWelcomeReply(
      base({
        todoist_overdue: [{ id: "1", content: "Ship spec" }],
      }),
    );
    expect(reply.followUps.length).toBe(2);
    expect(reply.answer.toLowerCase()).not.toMatch(/thin on tasks/);
  });
});
