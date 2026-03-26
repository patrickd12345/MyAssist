import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchDailyContextFromN8n,
  prioritizeGmailSignalsWithAi,
  resolveGmailSubject,
} from "./fetchDailyContext";
import { integrationService } from "./integrations/service";

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
    process.env.MYASSIST_ENABLE_EMAIL_IMPORTANCE_AI = "0";
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

  it("derives subject from snippet when subject is empty or placeholder", async () => {
    process.env.MYASSIST_N8N_WEBHOOK_URL = "https://example.com/webhook";
    setNodeEnv("production");

    const payload = {
      ...validPayload,
      gmail_signals: [
        {
          id: "g2",
          threadId: "t2",
          from: "a@b.com",
          subject: "",
          snippet: "Hello Patrick, our fantastic team is growing again!",
          date: "2026-03-25T12:00:00.000Z",
        },
      ],
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    const { context } = await fetchDailyContextFromN8n();
    expect(context.gmail_signals[0].subject).toBe("Hello Patrick, our fantastic team is growing again!");
  });

  it("keeps n8n calendar events when OAuth calendar pull returns an empty array", async () => {
    process.env.MYASSIST_N8N_WEBHOOK_URL = "https://example.com/webhook";
    setNodeEnv("production");

    const payloadWithCalendar = {
      ...validPayload,
      calendar_today: [
        {
          id: "evt_1",
          summary: "Calendar event from n8n",
          start: "2026-03-26T12:00:00.000Z",
          end: "2026-03-26T12:30:00.000Z",
          location: "Virtual",
        },
      ],
    };

    const gmailSpy = vi.spyOn(integrationService, "fetchGmailSignals").mockResolvedValue(null);
    const calendarSpy = vi.spyOn(integrationService, "fetchCalendarEvents").mockResolvedValue([]);

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(payloadWithCalendar), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { context } = await fetchDailyContextFromN8n(undefined, "test-user-1");
    expect(context.calendar_today).toHaveLength(1);
    expect(context.calendar_today[0]?.summary).toBe("Calendar event from n8n");

    gmailSpy.mockRestore();
    calendarSpy.mockRestore();
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

    await expect(fetchDailyContextFromN8n()).rejects.toThrow(/request failed \(502\)/);
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
