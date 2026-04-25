import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

describe("GET /api/job-hunt/digest", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.MYASSIST_AUTH_DISABLED = "true";
    process.env.MYASSIST_DEV_USER_ID = "test-user";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns digest when job-hunt digest server responds", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        generated_at: "2026-01-01T00:00:00.000Z",
        followups_due_approx: 1,
        by_track: {},
        tracks: [{ id: "ai_focus", label: "AI focus", kind: "builtin" }],
      }),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; digest?: { followups_due_approx: number } };
    expect(body.ok).toBe(true);
    expect(body.digest?.followups_due_approx).toBe(1);
  });

  it("returns ok:false when digest server is unreachable", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("fetch failed"));

    const res = await GET();
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("fetch failed");
  });
});
