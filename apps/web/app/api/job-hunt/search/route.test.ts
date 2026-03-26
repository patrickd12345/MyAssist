import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

describe("GET /api/job-hunt/search", () => {
  const originalFetch = globalThis.fetch;
  const originalDigestUrl = process.env.JOB_HUNT_DIGEST_URL;

  beforeEach(() => {
    process.env.MYASSIST_AUTH_DISABLED = "true";
    process.env.MYASSIST_DEV_USER_ID = "test-user";
    delete process.env.JOB_HUNT_DIGEST_URL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    if (originalDigestUrl === undefined) delete process.env.JOB_HUNT_DIGEST_URL;
    else process.env.JOB_HUNT_DIGEST_URL = originalDigestUrl;
  });

  it("proxies to digest /jobs with default base URL", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query: { track: "ai_focus" },
        total_deduped: 2,
        returned: 1,
        jobs: [{ id: "j1", title: "Role", company: "Co", url: "https://example.com" }],
      }),
    });

    const req = new Request("http://localhost/api/job-hunt/search?track=ai_focus");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data?: { jobs: unknown[] } };
    expect(body.ok).toBe(true);
    expect(body.data?.jobs).toHaveLength(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3847/jobs?track=ai_focus&sort=feed",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("uses JOB_HUNT_DIGEST_URL host for /jobs when set", async () => {
    process.env.JOB_HUNT_DIGEST_URL = "http://127.0.0.1:9999/digest";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ query: {}, total_deduped: 0, returned: 0, jobs: [] }),
    });

    const req = new Request("http://localhost/api/job-hunt/search?track=sap_bridge");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:9999/jobs?track=sap_bridge&sort=feed",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("passes sort=relevance when requested", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ query: {}, total_deduped: 0, returned: 0, jobs: [] }),
    });

    const req = new Request("http://localhost/api/job-hunt/search?track=ai_focus&sort=relevance");
    await GET(req);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3847/jobs?track=ai_focus&sort=relevance",
      expect.objectContaining({ cache: "no-store" }),
    );
  });
});
