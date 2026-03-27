import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

const mockFetch = vi.fn();

describe("POST /api/assistant", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    vi.stubGlobal("fetch", mockFetch);
    const mod = await import("./route");
    POST = mod.POST;
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns 400 when chat kind has empty message", async () => {
    const res = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "chat", message: "   ", context: minimalContext }),
      }),
    );
    expect(res.status).toBe(400);
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
});
