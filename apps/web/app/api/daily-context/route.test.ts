import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockContext = {
  generated_at: "2026-03-25T00:00:00.000Z",
  run_date: "2026-03-25",
  todoist_overdue: [],
  todoist_due_today: [],
  todoist_upcoming_high_priority: [],
  gmail_signals: [],
  calendar_today: [],
};

const { readLastDailyContext, writeLastDailyContext } = vi.hoisted(() => ({
  readLastDailyContext: vi.fn(),
  writeLastDailyContext: vi.fn(),
}));
const { fetchCalendarEvents, fetchGmailSignals } = vi.hoisted(() => ({
  fetchCalendarEvents: vi.fn(),
  fetchGmailSignals: vi.fn(),
}));

vi.mock("@/lib/dailyContextSnapshot", () => ({
  readLastDailyContext,
  writeLastDailyContext,
}));

vi.mock("@/lib/fetchDailyContext", () => ({
  fetchDailyContextLive: vi.fn(async () => ({
    context: mockContext,
    source: "live" as const,
  })),
  MYASSIST_CONTEXT_SOURCE_HEADER: "x-myassist-context-source",
}));

vi.mock("@/lib/memoryStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/memoryStore")>();
  return {
    ...actual,
    getTaskNudges: vi.fn(async () => ({})),
  };
});

vi.mock("@/lib/integrations/service", () => ({
  integrationService: {
    fetchCalendarEvents,
    fetchGmailSignals,
  },
}));

describe("GET /api/daily-context", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import("./route");
    GET = mod.GET;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    readLastDailyContext.mockResolvedValue(null);
    writeLastDailyContext.mockResolvedValue(undefined);
    fetchCalendarEvents.mockResolvedValue(null);
    fetchGmailSignals.mockResolvedValue(null);
  });

  it("returns JSON body and sets source header on live fetch", async () => {
    const req = new NextRequest("http://localhost/api/daily-context");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { run_date: string };
    expect(json.run_date).toBe("2026-03-25");
    expect((json as { unified_daily_briefing?: unknown }).unified_daily_briefing).toBeDefined();
    expect(res.headers.get("x-myassist-context-source")).toBe("live");
    expect(writeLastDailyContext).toHaveBeenCalled();
    expect(readLastDailyContext).not.toHaveBeenCalled();
  });

  it("returns 404 when cache is requested but missing", async () => {
    readLastDailyContext.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/daily-context?source=cache");
    const res = await GET(req);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("no_cached_snapshot");
    expect(writeLastDailyContext).not.toHaveBeenCalled();
  });

  it("returns cached snapshot when source=cache", async () => {
    readLastDailyContext.mockResolvedValueOnce(mockContext);
    const req = new NextRequest("http://localhost/api/daily-context?source=cache");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-myassist-context-source")).toBe("cache");
    const json = (await res.json()) as { run_date: string };
    expect(json.run_date).toBe("2026-03-25");
    expect((json as { unified_daily_briefing?: unknown }).unified_daily_briefing).toBeDefined();
    expect(writeLastDailyContext).not.toHaveBeenCalled();
  });

  it("hydrates cache response with live OAuth calendar events", async () => {
    readLastDailyContext.mockResolvedValueOnce(mockContext);
    fetchCalendarEvents.mockResolvedValueOnce([
      {
        id: "evt-1",
        summary: "Live calendar event",
        start: { dateTime: "2026-03-25T13:00:00.000Z" },
        end: { dateTime: "2026-03-25T13:30:00.000Z" },
        location: "Zoom",
      },
    ]);

    const req = new NextRequest("http://localhost/api/daily-context?source=cache");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { calendar_today: Array<{ summary: string; location: string | null }> };
    expect(json.calendar_today).toHaveLength(1);
    expect(json.calendar_today[0]?.summary).toBe("Live calendar event");
    expect(json.calendar_today[0]?.location).toBe("Zoom");
    const withIntel = json as { calendar_intelligence?: { summary: string } };
    expect(withIntel.calendar_intelligence?.summary).toBeTruthy();
  });

  it("returns a provider-scoped google_calendar slice with intelligence", async () => {
    fetchCalendarEvents.mockResolvedValueOnce([
      {
        id: "evt-2",
        summary: "Planning",
        start: { dateTime: "2026-03-25T15:00:00.000Z" },
        end: { dateTime: "2026-03-25T16:00:00.000Z" },
      },
    ]);
    const req = new NextRequest("http://localhost/api/daily-context?provider=google_calendar");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      provider: string;
      calendar_today: Array<{ summary: string }>;
      calendar_intelligence: { summary: string; counts: { eventsInWindow: number } };
      unified_daily_briefing?: { summary: string };
    };
    expect(json.provider).toBe("google_calendar");
    expect(json.calendar_today).toHaveLength(1);
    expect(json.calendar_intelligence.counts.eventsInWindow).toBe(1);
    expect(json.calendar_intelligence.summary.length).toBeGreaterThan(0);
    expect(json.unified_daily_briefing?.summary).toBeTruthy();
  });

  it("returns a provider-scoped gmail slice when requested", async () => {
    fetchGmailSignals.mockResolvedValueOnce([
      {
        id: "msg-1",
        threadId: "thread-1",
        from: "Jane",
        subject: "Follow up",
        snippet: "Quick check-in",
        date: "2026-03-25",
      },
    ]);
    const req = new NextRequest("http://localhost/api/daily-context?provider=gmail");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      provider: string;
      source: string;
      gmail_signals: Array<{ subject: string }>;
      daily_intelligence: { summary: { generatedDeterministicSummary: string } };
      unified_daily_briefing?: { summary: string };
    };
    expect(json.provider).toBe("gmail");
    expect(json.source).toBe("live");
    expect(json.gmail_signals).toHaveLength(1);
    expect(json.gmail_signals[0]?.subject).toBe("Follow up");
    expect(json.daily_intelligence.summary.generatedDeterministicSummary).toBeTruthy();
    expect(json.unified_daily_briefing?.summary).toBeTruthy();
    expect(writeLastDailyContext).not.toHaveBeenCalled();
  });
});
