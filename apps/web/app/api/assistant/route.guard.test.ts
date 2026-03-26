import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getSessionUserId: vi.fn(async () => null),
}));

vi.mock("@/lib/memoryStore", () => ({
  getResolvedItems: vi.fn(async () => []),
  getRollingMemoryPrompt: vi.fn(async () => "[]"),
  storeBriefFeedback: vi.fn(async () => ({ entries: 7 })),
  storeResolvedItem: vi.fn(async () => ({ entries: 8 })),
  storeSituationBrief: vi.fn(async () => ({ entries: 2 })),
}));

process.env.OLLAMA_MODEL = "chat-model";

describe("POST /api/assistant auth guard", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("returns 401 when there is no session user", async () => {
    const res = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "situation_feedback",
          run_date: "2026-03-25",
          rating: "useful",
        }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
