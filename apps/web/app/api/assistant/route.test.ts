import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/memoryStore", () => ({
  getRollingMemoryPrompt: vi.fn(async () => "[]"),
  storeBriefFeedback: vi.fn(async () => ({ entries: 7 })),
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
