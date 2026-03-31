import { describe, expect, it } from "vitest";
import { buildContextDigest } from "./assistant";
import { buildCalendarIntelligence } from "./calendarIntelligence";
import { buildCalendarIntelligencePromptBlock } from "./calendarIntelligencePrompt";
import { buildDailyIntelligencePromptBlock } from "./dailyIntelligencePrompt";
import type { DailyIntelligence, MyAssistDailyContext } from "./types";

const baseContext: MyAssistDailyContext = {
  generated_at: "2026-03-25T12:00:00.000Z",
  run_date: "2026-03-25",
  todoist_overdue: [],
  todoist_due_today: [],
  todoist_upcoming_high_priority: [],
  gmail_signals: [],
  calendar_today: [],
};

const sampleIntel: DailyIntelligence = {
  urgent: [],
  important: [],
  action_required: [],
  job_related: [],
  calendar_related: [],
  summary: {
    countsByType: { important: 1 },
    topPriorities: ["Alpha", "Beta"],
    generatedDeterministicSummary: "Deterministic line.",
    aiSummary: "Optional AI line.",
  },
};

describe("buildDailyIntelligencePromptBlock", () => {
  it("returns null when daily_intelligence is absent", () => {
    expect(buildDailyIntelligencePromptBlock(baseContext)).toBeNull();
  });

  it("includes bucket counts, summary, priorities, and ai_summary when present", () => {
    const block = buildDailyIntelligencePromptBlock({
      ...baseContext,
      daily_intelligence: sampleIntel,
    });
    expect(block).not.toBeNull();
    expect(block?.bucket_counts).toEqual({
      urgent: 0,
      important: 0,
      action_required: 0,
      job_related: 0,
      calendar_related: 0,
    });
    expect(block?.deterministic_summary).toBe("Deterministic line.");
    expect(block?.top_priorities).toEqual(["Alpha", "Beta"]);
    expect(block?.ai_summary).toBe("Optional AI line.");
  });

  it("omits ai_summary when empty or missing", () => {
    const withoutAi: DailyIntelligence = {
      ...sampleIntel,
      summary: { ...sampleIntel.summary, aiSummary: undefined },
    };
    const block = buildDailyIntelligencePromptBlock({
      ...baseContext,
      daily_intelligence: withoutAi,
    });
    expect(block).not.toHaveProperty("ai_summary");

    const whitespace = buildDailyIntelligencePromptBlock({
      ...baseContext,
      daily_intelligence: {
        ...withoutAi,
        summary: { ...withoutAi.summary, aiSummary: "   " },
      },
    });
    expect(whitespace).not.toHaveProperty("ai_summary");
  });
});

describe("buildContextDigest daily_intelligence", () => {
  it("includes daily_intelligence key when block is present", () => {
    const json = buildContextDigest({
      ...baseContext,
      daily_intelligence: sampleIntel,
    });
    const parsed = JSON.parse(json) as { daily_intelligence?: Record<string, unknown> };
    expect(parsed.daily_intelligence).toBeDefined();
    expect(parsed.daily_intelligence?.deterministic_summary).toBe("Deterministic line.");
  });

  it("omits daily_intelligence when absent", () => {
    const json = buildContextDigest(baseContext);
    const parsed = JSON.parse(json) as { daily_intelligence?: unknown };
    expect(parsed.daily_intelligence).toBeUndefined();
  });
});

describe("buildCalendarIntelligencePromptBlock", () => {
  it("returns null when calendar_intelligence is absent", () => {
    expect(buildCalendarIntelligencePromptBlock(baseContext)).toBeNull();
  });

  it("includes summary and signal types when present", () => {
    const ci = buildCalendarIntelligence(
      [
        {
          id: "1",
          summary: "Interview",
          start: "2026-03-25T12:00:00.000Z",
          end: "2026-03-25T13:00:00.000Z",
          location: null,
        },
      ],
      new Date("2026-03-25T10:00:00.000Z").getTime(),
      "2026-03-25",
    );
    const block = buildCalendarIntelligencePromptBlock({ ...baseContext, calendar_intelligence: ci });
    expect(block).not.toBeNull();
    expect(block?.summary).toBeTruthy();
    expect(Array.isArray(block?.signal_types)).toBe(true);
  });
});

describe("buildContextDigest calendar_intelligence", () => {
  it("includes calendar_intelligence key when present", () => {
    const ci = buildCalendarIntelligence([], Date.now(), "2026-03-25");
    const json = buildContextDigest({ ...baseContext, calendar_intelligence: ci });
    const parsed = JSON.parse(json) as { calendar_intelligence?: { summary: string } };
    expect(parsed.calendar_intelligence?.summary).toMatch(/No calendar events/);
  });

  it("omits calendar_intelligence when absent", () => {
    const json = buildContextDigest(baseContext);
    const parsed = JSON.parse(json) as { calendar_intelligence?: unknown };
    expect(parsed.calendar_intelligence).toBeUndefined();
  });
});

describe("buildContextDigest todoist_intelligence", () => {
  it("includes compact todoist intelligence when present", () => {
    const json = buildContextDigest({
      ...baseContext,
      todoist_intelligence: {
        signals: [{ type: "overdue_task", detail: "1 overdue task(s)." }],
        counts: { total: 1, overdue: 1, dueToday: 0, highPriority: 0 },
        summary: "Todoist: 1 overdue, 0 due today, 0 high-priority.",
      },
    });
    const parsed = JSON.parse(json) as { todoist_intelligence?: { summary: string } };
    expect(parsed.todoist_intelligence?.summary).toContain("Todoist:");
  });
});
