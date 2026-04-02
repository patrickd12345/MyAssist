import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/memoryStore", () => ({
  getResolvedItems: vi.fn(async () => []),
  getRollingMemoryPrompt: vi.fn(async () => "[]"),
  storeBriefFeedback: vi.fn(async () => ({ entries: 7 })),
  storeResolvedItem: vi.fn(async () => ({ entries: 8 })),
  storeSituationBrief: vi.fn(async () => ({ entries: 2 })),
}));

process.env.OLLAMA_MODEL = "chat-model";
process.env.OLLAMA_HEADLINE_MODELS = "headline-model";
process.env.OLLAMA_SITUATION_MODELS = "sit-model";

const minimalContext = {
  generated_at: "2026-03-25T00:00:00.000Z",
  run_date: "2026-03-25",
  todoist_overdue: [],
  todoist_due_today: [],
  todoist_upcoming_high_priority: [],
  gmail_signals: [],
  calendar_today: [],
};

/** Shared stub for `@bookiji-inc/ai-runtime` Ollama and gateway HTTP. */
const mockFetch = vi.fn();

let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  vi.stubGlobal("fetch", mockFetch);
  const mod = await import("./route");
  POST = mod.POST;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/assistant", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns 400 when chat kind has empty message", async () => {
    const res = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-request-id": "req_empty_message" },
        body: JSON.stringify({ kind: "chat", message: "   ", context: minimalContext }),
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string; message: string; requestId: string };
    expect(json.code).toBe("message_required");
    expect(json.message).toBe("Message is required.");
    expect(json.requestId).toBe("req_empty_message");
  });

  it("returns 400 when situation_feedback is missing run_date or rating", async () => {
    const res = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "situation_feedback", rating: "useful" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when resolve_item is missing fields", async () => {
    const res = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "resolve_item", text: "Cancel trial" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("persists situation_feedback and returns ok", async () => {
    const res = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "situation_feedback",
          run_date: "2026-03-25",
          rating: "needs_work",
          note: "too vague",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; memory_entries: number };
    expect(json.ok).toBe(true);
    expect(json.memory_entries).toBe(7);
  });

  it("persists resolved items and returns ok", async () => {
    const res = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "resolve_item",
          run_date: "2026-03-25",
          source: "email",
          text: "Your trial is ending soon",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; memory_entries: number };
    expect(json.ok).toBe(true);
    expect(json.memory_entries).toBe(8);
  });

  it("returns memory status", async () => {
    const res = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "memory_status",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { resolved_items: unknown[] };
    expect(Array.isArray(json.resolved_items)).toBe(true);
  });

  it("returns ollama chat reply when Ollama returns JSON", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: { content: JSON.stringify({ answer: "Ship the fix.", actions: ["a"], followUps: ["b?"] }) },
        }),
        { status: 200 },
      ),
    );

    const res = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "chat",
          message: "What now?",
          context: minimalContext,
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { mode: string; answer: string };
    expect(json.mode).toBe("ollama");
    expect(json.answer).toContain("Ship");
  });

  it("falls back to buildFallbackReply when chat Ollama request fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("fetch failed: ECONNREFUSED"));

    const res = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "chat",
          message: "What can I safely defer?",
          context: minimalContext,
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { mode: string; fallbackReason?: string; answer: string };
    expect(json.mode).toBe("fallback");
    expect(json.fallbackReason).toBe("fetch failed: ECONNREFUSED");
    expect(json.answer).toContain("Park");
  });

  it("falls back when chat Ollama request hangs", async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementationOnce(
      () =>
        new Promise(() => {
          // Never resolve: validates timeout guard.
        }),
    );

    const pending = POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "chat",
          message: "What should happen if AI hangs?",
          context: minimalContext,
        }),
      }),
    );

    await vi.advanceTimersByTimeAsync(60_000);
    const res = await pending;
    expect(res.status).toBe(200);
    const json = (await res.json()) as { mode: string; fallbackReason?: string; answer: string };
    expect(json.mode).toBe("fallback");
    expect(json.fallbackReason).toBe("assistant_chat_timeout");
    expect(json.answer.length).toBeGreaterThan(0);
  });

  it("routes chief-of-staff day summary chat prompts to situation brief path", async () => {
    const briefJson = {
      pressure_summary: "Operational pressure is high.",
      top_priorities: ["p1", "p2", "p3"],
      conflicts_and_risks: ["r1", "r2"],
      defer_recommendations: ["d1", "d2"],
      next_actions: ["n1", "n2", "n3"],
      confidence_and_limits: "Snapshot only.",
      memory_insights: [],
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: { content: JSON.stringify(briefJson) } }), { status: 200 }),
    );

    const res = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "chat",
          message: "Summarize my day like a chief of staff.",
          context: minimalContext,
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { mode: string; answer: string; actions: string[] };
    expect(json.mode).toBe("ollama");
    expect(json.answer).toContain("Operational pressure");
    expect(json.actions).toEqual(["n1", "n2"]);

    const call = mockFetch.mock.calls[0] as [string, { body: string }];
    const request = JSON.parse(call[1].body) as { model: string };
    expect(request.model).toBe("sit-model");
  });

  it("returns ollama headline when model returns plain text", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: { content: "A clear day with priorities ahead." } }), { status: 200 }),
    );

    const res = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "headline",
          context: minimalContext,
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { mode: string; answer: string };
    expect(json.mode).toBe("ollama");
    expect(json.answer.length).toBeGreaterThan(0);
  });

  it("returns ollama situation_brief when model returns JSON", async () => {
    const briefJson = {
      pressure_summary: "Heavy load today.",
      top_priorities: ["p1", "p2", "p3"],
      conflicts_and_risks: ["r1", "r2"],
      defer_recommendations: ["d1", "d2"],
      next_actions: ["n1", "n2", "n3"],
      confidence_and_limits: "Snapshot only.",
      memory_insights: [],
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: { content: JSON.stringify(briefJson) } }), { status: 200 }),
    );

    const res = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "situation_brief",
          context: minimalContext,
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { mode: string; brief: { pressure_summary: string } };
    expect(json.mode).toBe("ollama");
    expect(json.brief.pressure_summary).toContain("Heavy");
  });

  it("falls back when situation_brief Ollama fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("boom"));

    const res = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "situation_brief",
          context: minimalContext,
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { mode: string; fallbackReason?: string };
    expect(json.mode).toBe("fallback");
    expect(json.fallbackReason).toBeDefined();
  });

  it("returns assistant_route_failed with requestId when request parsing throws", async () => {
    const res = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-request-id": "req_parse_failure" },
        body: "{",
      }),
    );

    expect(res.status).toBe(500);
    const json = (await res.json()) as { code: string; message: string; requestId: string };
    expect(json.code).toBe("assistant_route_failed");
    expect(json.requestId).toBe("req_parse_failure");
  });
});

describe("POST /api/assistant (AI_MODE=gateway)", () => {
  const prevAi = process.env.AI_MODE;
  const prevBase = process.env.VERCEL_AI_BASE_URL;
  const prevKey = process.env.VERCEL_VIRTUAL_KEY;
  const prevOpenAiModel = process.env.OPENAI_MODEL;

  beforeAll(() => {
    process.env.AI_MODE = "gateway";
    process.env.VERCEL_AI_BASE_URL = "https://gateway.example.com";
    process.env.VERCEL_VIRTUAL_KEY = "vk-test";
    process.env.OPENAI_MODEL = "gpt-4o-mini";
  });

  afterAll(() => {
    if (prevAi === undefined) delete process.env.AI_MODE;
    else process.env.AI_MODE = prevAi;
    if (prevBase === undefined) delete process.env.VERCEL_AI_BASE_URL;
    else process.env.VERCEL_AI_BASE_URL = prevBase;
    if (prevKey === undefined) delete process.env.VERCEL_VIRTUAL_KEY;
    else process.env.VERCEL_VIRTUAL_KEY = prevKey;
    if (prevOpenAiModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = prevOpenAiModel;
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns gateway chat reply when gateway returns OpenAI-compatible JSON", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "Ship from gateway.",
                  actions: ["a"],
                  followUps: ["b?"],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const res = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "chat",
          message: "What now?",
          context: minimalContext,
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { mode: string; answer: string; provider: string };
    expect(json.mode).toBe("gateway");
    expect(json.provider).toBe("gateway");
    expect(json.answer).toContain("gateway");

    const call = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe("https://gateway.example.com/v1/chat/completions");
  });
});
