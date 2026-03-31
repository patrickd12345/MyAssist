import { afterEach, describe, expect, it, vi } from "vitest";
import * as aiRuntime from "./aiRuntime";
import { buildGoodMorningMessage, buildGoodMorningMessageDeterministic } from "./goodMorning";
import type { UnifiedDailyBriefing } from "./types";

function briefing(overrides: Partial<UnifiedDailyBriefing> = {}): UnifiedDailyBriefing {
  const base: UnifiedDailyBriefing = {
    urgent: [],
    important: [],
    action_required: [],
    job_related: [],
    calendar_events_in_view: 0,
    schedule_summary: "",
    tasks_summary: "",
    email_summary: "",
    summary: "",
    counts: {
      urgent: 0,
      important: 0,
      action_required: 0,
      job_related: 0,
    },
  };
  return { ...base, ...overrides };
}

describe("buildGoodMorningMessageDeterministic", () => {
  it("quiet day", () => {
    const out = buildGoodMorningMessageDeterministic(briefing());
    expect(out.message).toBe("Good morning — your day looks relatively calm.");
    expect(out.tone).toBe("neutral");
    expect(typeof out.generatedAt).toBe("string");
  });

  it("urgent day", () => {
    const out = buildGoodMorningMessageDeterministic(
      briefing({
        counts: { urgent: 3, important: 0, action_required: 0, job_related: 0 },
      }),
    );
    expect(out.message).toContain("3 urgent items today");
  });

  it("busy schedule", () => {
    const out = buildGoodMorningMessageDeterministic(
      briefing({
        calendar_events_in_view: 5,
        counts: { urgent: 0, important: 0, action_required: 0, job_related: 0 },
      }),
    );
    expect(out.message).toContain("busy today with 5 meetings");
  });

  it("job day", () => {
    const out = buildGoodMorningMessageDeterministic(
      briefing({
        counts: { urgent: 0, important: 0, action_required: 0, job_related: 2 },
      }),
    );
    expect(out.message).toContain("2 job-related updates");
  });

  it("combines urgent, busy, and job", () => {
    const out = buildGoodMorningMessageDeterministic(
      briefing({
        calendar_events_in_view: 4,
        counts: { urgent: 1, important: 0, action_required: 0, job_related: 1 },
      }),
    );
    expect(out.message).toMatch(/urgent item/);
    expect(out.message).toMatch(/busy today with 4 meetings/);
    expect(out.message).toMatch(/job-related update/);
  });
});

describe("buildGoodMorningMessage", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("AI disabled uses deterministic only", async () => {
    delete process.env.MYASSIST_DAILY_INTEL_AI;
    const spy = vi.spyOn(aiRuntime, "executeChat");
    const out = await buildGoodMorningMessage(
      briefing({ counts: { urgent: 2, important: 0, action_required: 0, job_related: 0 } }),
    );
    expect(out.message).toContain("2 urgent items");
    expect(spy).not.toHaveBeenCalled();
  });

  it("AI failure falls back to deterministic", async () => {
    process.env.MYASSIST_DAILY_INTEL_AI = "1";
    vi.spyOn(aiRuntime, "executeChat").mockRejectedValue(new Error("unavailable"));
    const out = await buildGoodMorningMessage(
      briefing({ counts: { urgent: 0, important: 0, action_required: 0, job_related: 0 } }),
    );
    expect(out.message).toBe("Good morning — your day looks relatively calm.");
  });

  it("AI success rewrites message", async () => {
    process.env.MYASSIST_DAILY_INTEL_AI = "1";
    vi.spyOn(aiRuntime, "executeChat").mockResolvedValue({
      text: "Rise and shine — calendar is light today.",
      provider: "ollama",
      model: "m",
      mode: "ollama",
      latencyMs: 1,
      fallbackReason: null,
    });
    const out = await buildGoodMorningMessage(briefing());
    expect(out.message).toBe("Rise and shine — calendar is light today.");
  });
});
