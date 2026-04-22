import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchDailyContextLive,
  prioritizeGmailSignalsWithAi,
  resolveGmailSubject,
} from "./fetchDailyContext";
import { getDemoDailyContext } from "./demoDailyContext";
import * as jobHuntEmailSignals from "./jobHuntEmailSignals";
import * as jobHuntEmailAssignment from "./jobHuntEmailAssignment";
import { integrationService } from "./integrations/service";
import * as todoistToken from "./todoistToken";

describe("fetchDailyContextLive", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.MYASSIST_ENABLE_EMAIL_IMPORTANCE_AI = "0";
    delete process.env.MYASSIST_USE_MOCK_CONTEXT;
    delete process.env.MYASSIST_DEMO_MODE;
    delete process.env.MYASSIST_DEMO_MODE_PRODUCTION_OVERRIDE;
    delete process.env.MYASSIST_DAILY_INTEL_AI;
    vi.spyOn(integrationService, "fetchGmailSignals").mockResolvedValue(null);
    vi.spyOn(integrationService, "fetchCalendarEvents").mockResolvedValue(null);
    vi.spyOn(todoistToken, "resolveTodoistApiToken").mockResolvedValue(undefined);
    vi.spyOn(jobHuntEmailSignals, "postJobHuntEmailSignals").mockResolvedValue([]);
    vi.spyOn(jobHuntEmailAssignment, "syncContactsFromJobHuntEmailMatches").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("returns mock context when MYASSIST_USE_MOCK_CONTEXT is true", async () => {
    process.env.MYASSIST_USE_MOCK_CONTEXT = "true";
    const { context, source } = await fetchDailyContextLive("user-1");
    expect(source).toBe("mock");
    expect(context.run_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(context.todoist_overdue)).toBe(true);
    expect(context.daily_intelligence?.summary.generatedDeterministicSummary).toBeDefined();
    expect(context.calendar_intelligence?.summary).toBeDefined();
    expect(context.unified_daily_briefing?.summary).toBeDefined();
    expect(context.good_morning_message?.message.length).toBeGreaterThan(0);
    expect(integrationService.fetchGmailSignals).not.toHaveBeenCalled();
  });

  it("rejects mock context in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.MYASSIST_USE_MOCK_CONTEXT = "true";

    await expect(fetchDailyContextLive("user-1")).rejects.toThrow(/MYASSIST_USE_MOCK_CONTEXT/);
    expect(integrationService.fetchGmailSignals).not.toHaveBeenCalled();
  });

  it("returns curated demo context when MYASSIST_DEMO_MODE is true", async () => {
    process.env.MYASSIST_DEMO_MODE = "true";
    const { context, source } = await fetchDailyContextLive("user-1");
    expect(source).toBe("demo");
    expect(context.gmail_signals.length).toBeGreaterThanOrEqual(2);
    expect(context.calendar_today.length).toBeGreaterThanOrEqual(2);
    expect(context.unified_daily_briefing?.counts).toBeDefined();
    expect(context.good_morning_message?.tone).toBe("neutral");
    expect(context.todoist_intelligence?.summary).toBeDefined();
    expect(integrationService.fetchGmailSignals).not.toHaveBeenCalled();
  });

  it("rejects demo context in production without explicit override", async () => {
    process.env.NODE_ENV = "production";
    process.env.MYASSIST_DEMO_MODE = "true";

    await expect(fetchDailyContextLive("user-1")).rejects.toThrow(/MYASSIST_DEMO_MODE/);
    expect(integrationService.fetchGmailSignals).not.toHaveBeenCalled();
  });

  it("allows demo context in production with explicit override", async () => {
    process.env.NODE_ENV = "production";
    process.env.MYASSIST_DEMO_MODE = "true";
    process.env.MYASSIST_DEMO_MODE_PRODUCTION_OVERRIDE = "true";

    const { source } = await fetchDailyContextLive("user-1");
    expect(source).toBe("demo");
    expect(integrationService.fetchGmailSignals).not.toHaveBeenCalled();
  });

  it("prefers MYASSIST_DEMO_MODE over MYASSIST_USE_MOCK_CONTEXT", async () => {
    process.env.MYASSIST_DEMO_MODE = "true";
    process.env.MYASSIST_USE_MOCK_CONTEXT = "true";
    const { source } = await fetchDailyContextLive("user-1");
    expect(source).toBe("demo");
  });

  it("exposes Northwind-style demo signals in the curated dataset", () => {
    const demo = getDemoDailyContext();
    expect(demo.gmail_signals.some((g) => g.subject.includes("Offer"))).toBe(true);
    expect(demo.calendar_today.some((e) => (e.summary ?? "").toLowerCase().includes("interview"))).toBe(true);
  });

  it("throws when user id is missing for live path", async () => {
    await expect(fetchDailyContextLive(null)).rejects.toThrow(/signed-in user/);
    await expect(fetchDailyContextLive("   ")).rejects.toThrow(/signed-in user/);
  });

  it("builds live context from Gmail when connected", async () => {
    vi.mocked(integrationService.fetchGmailSignals).mockResolvedValue([
      {
        id: "g1",
        threadId: "t1",
        from: { text: "Alice <a@b.com>" },
        subject: "Hello",
        snippet: "Hi",
        date: "2026-03-25T12:00:00.000Z",
      },
    ]);
    vi.mocked(integrationService.fetchCalendarEvents).mockResolvedValue([]);

    const { context, source } = await fetchDailyContextLive("test-user-1");
    expect(source).toBe("live");
    expect(context.gmail_signals[0]?.from).toContain("Alice");
    expect(context.gmail_signals[0]?.subject).toBe("Hello");
    expect(context.unified_daily_briefing?.summary).toBeDefined();
  });

  it("derives subject from snippet when subject is empty or placeholder", async () => {
    vi.mocked(integrationService.fetchGmailSignals).mockResolvedValue([
      {
        id: "g2",
        threadId: "t2",
        from: "a@b.com",
        subject: "",
        snippet: "Hello Patrick, our fantastic team is growing again!",
        date: "2026-03-25T12:00:00.000Z",
      },
    ]);
    vi.mocked(integrationService.fetchCalendarEvents).mockResolvedValue([]);

    const { context } = await fetchDailyContextLive("test-user-1");
    expect(context.gmail_signals[0]?.subject).toBe("Hello Patrick, our fantastic team is growing again!");
  });

  it("uses empty calendar when live calendar fetch returns an empty array", async () => {
    vi.mocked(integrationService.fetchGmailSignals).mockResolvedValue([]);
    vi.mocked(integrationService.fetchCalendarEvents).mockResolvedValue([]);

    const { context } = await fetchDailyContextLive("test-user-1");
    expect(context.calendar_today).toEqual([]);
    expect(context.calendar_intelligence?.summary).toMatch(/No calendar events/);
  });

  it("posts job-hunt signals only after job-hunt analysis enrichment", async () => {
    const postSpy = vi.mocked(jobHuntEmailSignals.postJobHuntEmailSignals);
    postSpy.mockResolvedValue([]);

    vi.mocked(integrationService.fetchGmailSignals).mockResolvedValue([
      {
        id: "g1",
        threadId: "t1",
        from: "recruiter@company.com",
        subject: "Interview next steps",
        snippet:
          "We would like to schedule an interview for the software engineer role at our company.",
        date: "2026-03-25T12:00:00.000Z",
      },
    ]);
    vi.mocked(integrationService.fetchCalendarEvents).mockResolvedValue([]);

    await fetchDailyContextLive("test-user-1");

    expect(postSpy).toHaveBeenCalled();
    const posted = postSpy.mock.calls[0]?.[0];
    expect(posted?.[0]?.job_hunt_analysis).toBeDefined();
    expect(posted?.[0]?.job_hunt_analysis?.normalizedIdentity).toBeDefined();
  });
});

describe("resolveGmailSubject", () => {
  it("keeps a real subject", () => {
    expect(resolveGmailSubject("Invoice due", "snippet")).toBe("Invoice due");
  });

  it("uses first line of snippet when subject is missing", () => {
    expect(resolveGmailSubject("", "First line here\nrest")).toBe("First line here");
  });

  it("replaces (no subject) placeholder with snippet", () => {
    expect(resolveGmailSubject("(no subject)", "Biron report ready")).toBe("Biron report ready");
  });
});

describe("prioritizeGmailSignalsWithAi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reorders signals using model-provided importance", async () => {
    process.env.MYASSIST_ENABLE_EMAIL_IMPORTANCE_AI = "1";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              ranked: [
                { index: 1, importance: 95, reason: "explicit urgent help request" },
                { index: 0, importance: 10, reason: "routine low-risk update" },
              ],
            }),
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const sorted = await prioritizeGmailSignalsWithAi([
      {
        id: "g1",
        threadId: "t1",
        from: "a@example.com",
        subject: "Normal update",
        snippet: "Routine weekly update.",
        date: "2026-03-25T10:00:00.000Z",
      },
      {
        id: "g2",
        threadId: "t2",
        from: "b@example.com",
        subject: "Need help",
        snippet: "This is an extreme emergency, call now.",
        date: "2026-03-25T09:00:00.000Z",
      },
    ]);

    expect(sorted[0]?.id).toBe("g2");
    expect(sorted[1]?.id).toBe("g1");
    expect(sorted[0]?.importance_reason).toBe("explicit urgent help request");
    expect(sorted[0]?.importance_score).toBe(95);
  });

  it("parses fenced JSON ranking output", async () => {
    process.env.MYASSIST_ENABLE_EMAIL_IMPORTANCE_AI = "1";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            content: "```json\n{\"ranked\":[{\"index\":1,\"importance\":88},{\"index\":0,\"importance\":12}]}\n```",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const sorted = await prioritizeGmailSignalsWithAi([
      {
        id: "g1",
        threadId: "t1",
        from: "a@example.com",
        subject: "A",
        snippet: "a",
        date: "2026-03-25T10:00:00.000Z",
      },
      {
        id: "g2",
        threadId: "t2",
        from: "b@example.com",
        subject: "B",
        snippet: "b",
        date: "2026-03-25T09:00:00.000Z",
      },
    ]);

    expect(sorted[0]?.id).toBe("g2");
  });

  it("returns original order when AI is disabled", async () => {
    process.env.MYASSIST_ENABLE_EMAIL_IMPORTANCE_AI = "0";
    const original = [
      {
        id: "g1",
        threadId: "t1",
        from: "a@example.com",
        subject: "A",
        snippet: "a",
        date: "2026-03-25T10:00:00.000Z",
      },
      {
        id: "g2",
        threadId: "t2",
        from: "b@example.com",
        subject: "B",
        snippet: "b",
        date: "2026-03-25T09:00:00.000Z",
      },
    ];

    const sorted = await prioritizeGmailSignalsWithAi(original);
    expect(sorted).toEqual(original);
  });
});
