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

vi.mock("@/lib/dailyContextSnapshot", () => ({
  readLastDailyContext,
  writeLastDailyContext,
}));

vi.mock("@/lib/fetchDailyContext", () => ({
  fetchDailyContextFromN8n: vi.fn(async () => ({
    context: mockContext,
    source: "n8n" as const,
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
  });

  it("returns JSON body and sets source header on live fetch", async () => {
    const req = new NextRequest("http://localhost/api/daily-context");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { run_date: string };
    expect(json.run_date).toBe("2026-03-25");
    expect(res.headers.get("x-myassist-context-source")).toBe("n8n");
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
    expect(writeLastDailyContext).not.toHaveBeenCalled();
  });
});
