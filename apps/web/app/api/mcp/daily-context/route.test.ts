import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchDailyContextLive = vi.fn();

vi.mock("@/lib/fetchDailyContext", () => ({
  fetchDailyContextLive: (...args: unknown[]) => mockFetchDailyContextLive(...args),
  MYASSIST_CONTEXT_SOURCE_HEADER: "x-myassist-context-source",
}));

vi.mock("@/lib/dailyContextSnapshot", () => ({
  writeLastDailyContext: vi.fn(async () => undefined),
}));

vi.mock("@/lib/memoryStore", () => ({
  getTaskNudges: vi.fn(async () => ({})),
}));

vi.mock("@/lib/unifiedDailyBriefing", () => ({
  buildUnifiedDailyBriefing: vi.fn(async () => ({
    urgent: [],
    important: [],
    action_required: [],
    job_related: [],
    calendar_events_in_view: 0,
    schedule_summary: "test",
    tasks_summary: "test",
    email_summary: "test",
    summary: "golden",
    counts: { urgent: 0, important: 0, action_required: 0, job_related: 0 },
  })),
}));

vi.mock("@/lib/goodMorning", () => ({
  buildGoodMorningMessage: vi.fn(async () => ({
    message: "Good morning",
    tone: "neutral" as const,
    generatedAt: "2026-01-01T00:00:00.000Z",
  })),
}));

let GET: (req: NextRequest) => Promise<Response>;

beforeEach(async () => {
  process.env.MYASSIST_MCP_TOKEN = "test-mcp-secret";
  process.env.MYASSIST_MCP_USER_ID = "user-mcp-1";
  mockFetchDailyContextLive.mockResolvedValue({
    context: {
      generated_at: "2026-01-01T00:00:00.000Z",
      run_date: "2026-01-01",
      todoist_overdue: [],
      todoist_due_today: [],
      todoist_upcoming_high_priority: [],
      gmail_signals: [],
      calendar_today: [],
    },
    source: "mock",
  });
  const mod = await import("./route");
  GET = mod.GET;
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.MYASSIST_MCP_TOKEN;
  delete process.env.MYASSIST_MCP_USER_ID;
});

describe("GET /api/mcp/daily-context", () => {
  it("returns 503 when MCP env is not set", async () => {
    vi.resetModules();
    delete process.env.MYASSIST_MCP_TOKEN;
    process.env.MYASSIST_MCP_USER_ID = "user-mcp-1";
    const mod = await import("./route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/mcp/daily-context", {
        headers: { Authorization: "Bearer x" },
      }),
    );
    expect(res.status).toBe(503);
  });

  it("returns 401 when bearer token does not match", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/mcp/daily-context", {
        headers: { Authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 with context when bearer matches", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/mcp/daily-context", {
        headers: { Authorization: "Bearer test-mcp-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { run_date: string; unified_daily_briefing?: { summary: string } };
    expect(json.run_date).toBe("2026-01-01");
    expect(json.unified_daily_briefing?.summary).toBe("golden");
    expect(res.headers.get("x-myassist-context-source")).toBe("mock");
  });
});
