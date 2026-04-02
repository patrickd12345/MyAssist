import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchDailyContextLive = vi.fn();

vi.mock("@/lib/fetchDailyContext", () => ({
  fetchDailyContextLive: (...args: unknown[]) => mockFetchDailyContextLive(...args),
}));

let GET: (req: NextRequest) => Promise<Response>;

beforeEach(async () => {
  process.env.MYASSIST_MCP_TOKEN = "test-mcp-secret";
  process.env.MYASSIST_MCP_USER_ID = "user-mcp-1";
  mockFetchDailyContextLive.mockResolvedValue({
    context: {
      generated_at: "2026-01-01T00:00:00.000Z",
      run_date: "2026-01-01",
      todoist_overdue: [{ id: "a1", content: "Task", priority: 1 }],
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

describe("GET /api/mcp/action-candidates", () => {
  it("returns 401 when bearer does not match", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/mcp/action-candidates", {
        headers: { Authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns candidates when authorized", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/mcp/action-candidates", {
        headers: { Authorization: "Bearer test-mcp-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { candidates: Array<{ action_id: string }>; generated_at: string };
    expect(json.generated_at).toBe("2026-01-01T00:00:00.000Z");
    expect(json.candidates.some((c) => c.action_id === "complete_task:a1")).toBe(true);
  });
});
