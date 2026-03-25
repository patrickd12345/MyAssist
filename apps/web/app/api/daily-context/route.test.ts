import { beforeAll, describe, expect, it, vi } from "vitest";

const mockContext = {
  generated_at: "2026-03-25T00:00:00.000Z",
  run_date: "2026-03-25",
  todoist_overdue: [],
  todoist_due_today: [],
  todoist_upcoming_high_priority: [],
  gmail_signals: [],
  calendar_today: [],
};

vi.mock("@/lib/fetchDailyContext", () => ({
  fetchDailyContextFromN8n: vi.fn(async () => ({
    context: mockContext,
    source: "n8n" as const,
  })),
  MYASSIST_CONTEXT_SOURCE_HEADER: "x-myassist-context-source",
}));

describe("GET /api/daily-context", () => {
  let GET: () => Promise<Response>;

  beforeAll(async () => {
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("returns JSON body and sets source header", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { run_date: string };
    expect(json.run_date).toBe("2026-03-25");
    expect(res.headers.get("x-myassist-context-source")).toBe("n8n");
  });
});
