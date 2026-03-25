import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDailyContextFromN8n } from "./fetchDailyContext";

const validPayload = {
  generated_at: "2026-03-25T00:00:00.000Z",
  run_date: "2026-03-25",
  todoist_overdue: [],
  todoist_due_today: [],
  todoist_upcoming_high_priority: [],
  gmail_signals: [
    {
      id: "g1",
      threadId: "t1",
      from: { text: "Alice <a@b.com>" },
      subject: "Hello",
      snippet: "Hi",
      date: "2026-03-25T12:00:00.000Z",
    },
  ],
  calendar_today: [],
};

function setNodeEnv(value: string) {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

describe("fetchDailyContextFromN8n", () => {
  const originalEnv = { ...process.env };
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("returns mock context when webhook URL is empty and dev default applies", async () => {
    delete process.env.MYASSIST_N8N_WEBHOOK_URL;
    setNodeEnv("development");
    delete process.env.MYASSIST_USE_MOCK_CONTEXT;

    const { context, source } = await fetchDailyContextFromN8n();
    expect(source).toBe("mock");
    expect(context.run_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(context.todoist_overdue)).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches and flattens Gmail object fields from n8n", async () => {
    process.env.MYASSIST_N8N_WEBHOOK_URL = "https://example.com/webhook";
    setNodeEnv("production");

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validPayload), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    const { context, source } = await fetchDailyContextFromN8n();
    expect(source).toBe("n8n");
    expect(context.gmail_signals[0].from).toContain("Alice");
    expect(context.gmail_signals[0].subject).toBe("Hello");
  });

  it("throws when webhook URL is missing in production without mock override", async () => {
    delete process.env.MYASSIST_N8N_WEBHOOK_URL;
    setNodeEnv("production");
    delete process.env.MYASSIST_USE_MOCK_CONTEXT;

    await expect(fetchDailyContextFromN8n()).rejects.toThrow(/MYASSIST_N8N_WEBHOOK_URL/);
  });

  it("throws on non-OK webhook response", async () => {
    process.env.MYASSIST_N8N_WEBHOOK_URL = "https://example.com/webhook";
    setNodeEnv("production");

    mockFetch.mockResolvedValueOnce(new Response("bad", { status: 502 }));

    await expect(fetchDailyContextFromN8n()).rejects.toThrow(/502/);
  });

  it("throws when JSON is invalid", async () => {
    process.env.MYASSIST_N8N_WEBHOOK_URL = "https://example.com/webhook";
    setNodeEnv("production");

    mockFetch.mockResolvedValueOnce(new Response("not-json", { status: 200 }));

    await expect(fetchDailyContextFromN8n()).rejects.toThrow(/valid JSON/);
  });

  it("throws when JSON shape is invalid", async () => {
    process.env.MYASSIST_N8N_WEBHOOK_URL = "https://example.com/webhook";
    setNodeEnv("production");

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ foo: 1 }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    await expect(fetchDailyContextFromN8n()).rejects.toThrow(/does not match/);
  });
});
