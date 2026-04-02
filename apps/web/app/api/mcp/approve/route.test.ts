import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchDailyContextLive = vi.fn();

vi.mock("@/lib/fetchDailyContext", () => ({
  fetchDailyContextLive: (...args: unknown[]) => mockFetchDailyContextLive(...args),
}));

let POST: (req: NextRequest) => Promise<Response>;

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
  POST = mod.POST;
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.MYASSIST_MCP_TOKEN;
  delete process.env.MYASSIST_MCP_USER_ID;
});

describe("POST /api/mcp/approve", () => {
  it("returns 400 when action_id is not in candidates", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/mcp/approve", {
        method: "POST",
        headers: { Authorization: "Bearer test-mcp-secret", "Content-Type": "application/json" },
        body: JSON.stringify({ action_id: "complete_task:missing" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns approval_token when action_id is valid", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/mcp/approve", {
        method: "POST",
        headers: { Authorization: "Bearer test-mcp-secret", "Content-Type": "application/json" },
        body: JSON.stringify({ action_id: "complete_task:a1" }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { approval_token: string; expires_at: string };
    expect(json.approval_token.length).toBeGreaterThan(10);
    expect(json.expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
