import { afterEach, describe, expect, it, vi } from "vitest";
import * as aiRuntime from "./aiRuntime";
import { buildUnifiedDailyBriefing } from "./unifiedDailyBriefing";
import type { GmailPhaseBSignal } from "./integrations/gmailSignalDetection";
import type { MyAssistDailyContext } from "./types";

function signal(type: GmailPhaseBSignal["type"], confidence = 0.9): GmailPhaseBSignal {
  return { messageId: "m", type, confidence, reason: "test" };
}

function baseContext(): MyAssistDailyContext {
  return {
    generated_at: "2026-03-31T09:00:00.000Z",
    run_date: "2026-03-31",
    gmail_signals: [],
    calendar_today: [],
    todoist_overdue: [],
    todoist_due_today: [],
    todoist_upcoming_high_priority: [],
  };
}

describe("buildUnifiedDailyBriefing", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("handles no signals", async () => {
    const out = await buildUnifiedDailyBriefing(baseContext());
    expect(out.counts.urgent).toBe(0);
    expect(out.summary).toMatch(/Urgent 0, important 0, action required 0/);
  });

  it("handles heavy day", async () => {
    const out = await buildUnifiedDailyBriefing({
      ...baseContext(),
      todoist_overdue: [
        { id: "t1", content: "Overdue P1", priority: 4 },
        { id: "t2", content: "Overdue P2", priority: 3 },
      ],
      todoist_due_today: [
        { id: "t3", content: "Due A", priority: 2 },
        { id: "t4", content: "Due B", priority: 2 },
      ],
      gmail_signals: [
        {
          id: "g1",
          threadId: "th1",
          from: "recruiter@company.com",
          subject: "Offer package",
          snippet: "please sign",
          date: "2026-03-31T08:00:00.000Z",
          phase_b_signals: [signal("job_offer"), signal("action_required")],
        },
      ],
    });
    expect(out.counts.urgent).toBeGreaterThan(1);
    expect(out.action_required.length).toBeGreaterThan(1);
  });

  it("handles job interview day", async () => {
    const out = await buildUnifiedDailyBriefing({
      ...baseContext(),
      calendar_today: [
        {
          id: "e1",
          summary: "Technical Interview - ACME",
          start: "2026-03-31T15:00:00.000Z",
          end: "2026-03-31T16:00:00.000Z",
          location: "Zoom",
        },
      ],
    });
    expect(out.urgent.some((line) => line.includes("Interview today"))).toBe(true);
    expect(out.counts.job_related).toBeGreaterThan(0);
  });

  it("handles overdue high-priority tasks", async () => {
    const out = await buildUnifiedDailyBriefing({
      ...baseContext(),
      todoist_overdue: [{ id: "t9", content: "File taxes", priority: 4 }],
    });
    expect(out.urgent.some((line) => line.includes("Overdue high-priority"))).toBe(true);
  });

  it("handles mixed signals", async () => {
    const out = await buildUnifiedDailyBriefing({
      ...baseContext(),
      gmail_signals: [
        {
          id: "g4",
          threadId: "th4",
          from: "recruiter@company.com",
          subject: "Interview invitation",
          snippet: "please pick a slot",
          date: "2026-03-31T08:00:00.000Z",
          phase_b_signals: [signal("job_interview"), signal("action_required"), signal("job_recruiter")],
        },
      ],
      todoist_due_today: [{ id: "t3", content: "Send updated resume", priority: 3 }],
    });
    expect(out.counts.urgent).toBeGreaterThan(0);
    expect(out.counts.important).toBeGreaterThan(0);
    expect(out.counts.action_required).toBeGreaterThan(0);
    expect(out.counts.job_related).toBeGreaterThan(0);
  });

  it("keeps deterministic summary when AI disabled", async () => {
    delete process.env.MYASSIST_DAILY_INTEL_AI;
    const spy = vi.spyOn(aiRuntime, "executeChat");
    const out = await buildUnifiedDailyBriefing(baseContext());
    expect(out.aiSummary).toBeUndefined();
    expect(out.summary.length).toBeGreaterThan(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("falls back when AI fails", async () => {
    process.env.MYASSIST_DAILY_INTEL_AI = "1";
    vi.spyOn(aiRuntime, "executeChat").mockRejectedValue(new Error("down"));
    const out = await buildUnifiedDailyBriefing(baseContext());
    expect(out.aiSummary).toBeUndefined();
    expect(out.summary).toMatch(/Urgent 0/);
  });
});
