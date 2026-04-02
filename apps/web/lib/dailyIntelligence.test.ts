import { afterEach, describe, expect, it, vi } from "vitest";
import type { GmailPhaseBSignal } from "./integrations/gmailSignalDetection";
import * as aiRuntime from "./aiRuntime";
import { buildDailyIntelligence, enrichDailyIntelligenceWithAi, rankScoreGmailSignal } from "./dailyIntelligence";
import type { GmailSignal } from "./types";

function pb(
  type: GmailPhaseBSignal["type"],
  confidence = 0.8,
  reason = "test",
): GmailPhaseBSignal {
  return { messageId: "m", type, confidence, reason };
}

function gs(
  id: string,
  subject: string,
  snippet: string,
  phases: GmailPhaseBSignal[],
  extra?: Partial<GmailSignal>,
): GmailSignal {
  return {
    id,
    threadId: "t",
    from: "a@b.com",
    subject,
    snippet,
    date: "2026-01-01T12:00:00.000Z",
    phase_b_signals: phases,
    ...extra,
  };
}

describe("buildDailyIntelligence", () => {
  it("flags offer + action_required as urgent", () => {
    const intel = buildDailyIntelligence([
      gs("1", "Offer", "Please sign", [pb("job_offer"), pb("action_required")]),
    ]);
    expect(intel.urgent.length).toBe(1);
    expect(intel.action_required.length).toBe(1);
    expect(intel.job_related.length).toBe(1);
  });

  it("flags interview + action_required as urgent", () => {
    const intel = buildDailyIntelligence([
      gs("2", "Interview", "Schedule here", [pb("job_interview"), pb("action_required")]),
    ]);
    expect(intel.urgent.some((s) => s.id === "2")).toBe(true);
  });

  it("puts recruiter outreach in job_related", () => {
    const intel = buildDailyIntelligence([gs("3", "Hello", "I recruit for ACME", [pb("job_recruiter")])]);
    expect(intel.job_related.length).toBe(1);
    expect(intel.urgent.length).toBe(0);
  });

  it("flags rejection as urgent", () => {
    const intel = buildDailyIntelligence([
      gs("4", "Update", "We will not move forward", [pb("job_rejection")]),
    ]);
    expect(intel.urgent.length).toBe(1);
  });

  it("handles important non-job email", () => {
    const intel = buildDailyIntelligence([
      gs("5", "FYI", "Newsletter", [pb("important")], { label_ids: ["IMPORTANT"] }),
    ]);
    expect(intel.important.length).toBe(1);
    expect(intel.job_related.length).toBe(0);
  });

  it("handles empty inbox", () => {
    const intel = buildDailyIntelligence([]);
    expect(intel.summary.generatedDeterministicSummary).toMatch(/No Gmail messages/);
  });

  it("handles messages with no Phase B tags", () => {
    const intel = buildDailyIntelligence([
      { id: "x", threadId: null, from: "a@b.com", subject: "Hi", snippet: "Yo", date: "2026-01-01" },
    ]);
    expect(intel.summary.generatedDeterministicSummary).toMatch(/No Phase B signal tags/);
  });

  it("dedupes duplicate message ids in input", () => {
    const row = gs("dup", "S", "body", [pb("job_application")]);
    const intel = buildDailyIntelligence([row, { ...row, snippet: "other" }]);
    expect(intel.job_related.length).toBe(1);
  });

  it("calendar_related bucket", () => {
    const intel = buildDailyIntelligence([
      gs("6", "Meet", "calendly link inside", [pb("calendar_related")]),
    ]);
    expect(intel.calendar_related.length).toBe(1);
  });

  it("rankScoreGmailSignal orders offer above calendar", () => {
    const a = gs("a", "A", "", [pb("job_offer", 0.9)]);
    const b = gs("b", "B", "", [pb("calendar_related", 0.9)]);
    expect(rankScoreGmailSignal(a)).toBeGreaterThan(rankScoreGmailSignal(b));
  });
});

describe("enrichDailyIntelligenceWithAi", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("leaves summary unchanged when MYASSIST_DAILY_INTEL_AI is unset", async () => {
    delete process.env.MYASSIST_DAILY_INTEL_AI;
    const spy = vi.spyOn(aiRuntime, "executeChat");
    const base = buildDailyIntelligence([gs("1", "X", "Y", [pb("important")])]);
    const out = await enrichDailyIntelligenceWithAi(base);
    expect(out.summary.aiSummary).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it("adds aiSummary when enabled and ai-runtime succeeds", async () => {
    process.env.MYASSIST_DAILY_INTEL_AI = "true";
    vi.spyOn(aiRuntime, "executeChat").mockResolvedValue({
      text: "Brief triage overview.",
      provider: "ollama",
      model: "m",
      mode: "ollama",
      latencyMs: 1,
      fallbackReason: null,
    });
    const base = buildDailyIntelligence([gs("1", "X", "Y", [pb("important")])]);
    const out = await enrichDailyIntelligenceWithAi(base);
    expect(out.summary.aiSummary).toBe("Brief triage overview.");
  });

  it("skips aiSummary when there is nothing meaningful to summarize", async () => {
    process.env.MYASSIST_DAILY_INTEL_AI = "true";
    const spy = vi.spyOn(aiRuntime, "executeChat");
    const base = buildDailyIntelligence([]);
    const out = await enrichDailyIntelligenceWithAi(base);
    expect(out.summary.aiSummary).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it("falls back deterministically when executeChat hangs", async () => {
    process.env.MYASSIST_DAILY_INTEL_AI = "true";
    vi.useFakeTimers();
    vi.spyOn(aiRuntime, "executeChat").mockImplementation(
      () =>
        new Promise(() => {
          // Never resolve: validates timeout guard.
        }),
    );
    const base = buildDailyIntelligence([gs("1", "X", "Y", [pb("important")])]);
    const pending = enrichDailyIntelligenceWithAi(base);
    await vi.advanceTimersByTimeAsync(60_000);
    const out = await pending;
    expect(out.summary.aiSummary).toBeUndefined();
    vi.useRealTimers();
  });

  it("falls back deterministically when executeChat throws", async () => {
    process.env.MYASSIST_DAILY_INTEL_AI = "true";
    vi.spyOn(aiRuntime, "executeChat").mockRejectedValue(new Error("unavailable"));
    const base = buildDailyIntelligence([gs("1", "X", "Y", [pb("important")])]);
    const out = await enrichDailyIntelligenceWithAi(base);
    expect(out.summary.aiSummary).toBeUndefined();
    expect(out.summary.generatedDeterministicSummary).toBe(base.summary.generatedDeterministicSummary);
  });
});
