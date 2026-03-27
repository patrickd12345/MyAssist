import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { storeResolvedItem } from "@/lib/memoryStore";

const mockFetch = vi.fn();

vi.mock("@/lib/memoryStore", () => ({
  storeResolvedItem: vi.fn().mockResolvedValue({ entries: 1 }),
}));

const mockStoreResolvedItem = vi.mocked(storeResolvedItem);

describe("POST /api/todoist/tasks/[taskId]/schedule", () => {
  let POST: typeof import("./route").POST;
  const originalToken = process.env.TODOIST_API_TOKEN;

  beforeAll(async () => {
    vi.stubGlobal("fetch", mockFetch);
    const mod = await import("./route");
    POST = mod.POST;
  });

  afterEach(() => {
    mockFetch.mockReset();
    mockStoreResolvedItem.mockClear();
    if (originalToken === undefined) {
      delete process.env.TODOIST_API_TOKEN;
    } else {
      process.env.TODOIST_API_TOKEN = originalToken;
    }
  });

  it("returns 400 when dueString is missing", async () => {
    process.env.TODOIST_API_TOKEN = "token";
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ taskId: "t1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("updates due date when Todoist returns ok", async () => {
    process.env.TODOIST_API_TOKEN = "token";
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "t1", due: { string: "tomorrow" } }), { status: 200 }),
    );

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueString: "tomorrow at 9am" }),
      }),
      { params: Promise.resolve({ taskId: "t1" }) },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; task: { id: string } };
    expect(json.ok).toBe(true);
    expect(json.task.id).toBe("t1");
  });

  it("stores snooze intent in rolling memory when provided", async () => {
    process.env.TODOIST_API_TOKEN = "token";
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "t1", due: { string: "tomorrow" } }), { status: 200 }),
    );

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dueString: "tomorrow at 9am",
          intent: "Needs focus time",
          taskContent: "Write report",
          run_date: "2026-03-25",
        }),
      }),
      { params: Promise.resolve({ taskId: "t1" }) },
    );
    expect(res.status).toBe(200);
    expect(mockStoreResolvedItem).toHaveBeenCalledWith("test-user", {
      text: 'Snoozed task "Write report" because: Needs focus time',
      source: "generic",
      run_date: "2026-03-25",
    });
  });

  it("does not call memory store when intent is omitted", async () => {
    process.env.TODOIST_API_TOKEN = "token";
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "t1", due: { string: "tomorrow" } }), { status: 200 }),
    );

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueString: "tomorrow at 9am" }),
      }),
      { params: Promise.resolve({ taskId: "t1" }) },
    );
    expect(res.status).toBe(200);
    expect(mockStoreResolvedItem).not.toHaveBeenCalled();
  });
});
