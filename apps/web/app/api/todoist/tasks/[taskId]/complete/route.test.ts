import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();

describe("POST /api/todoist/tasks/[taskId]/complete", () => {
  let POST: typeof import("./route").POST;
  const originalToken = process.env.TODOIST_API_TOKEN;

  beforeAll(async () => {
    vi.stubGlobal("fetch", mockFetch);
    const mod = await import("./route");
    POST = mod.POST;
  });

  afterEach(() => {
    mockFetch.mockReset();
    if (originalToken === undefined) {
      delete process.env.TODOIST_API_TOKEN;
    } else {
      process.env.TODOIST_API_TOKEN = originalToken;
    }
  });

  it("returns 500 when token is missing", async () => {
    delete process.env.TODOIST_API_TOKEN;
    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ taskId: "t1" }),
    });
    expect(res.status).toBe(500);
  });

  it("returns 400 when taskId is empty", async () => {
    process.env.TODOIST_API_TOKEN = "token";
    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ taskId: "   " }),
    });
    expect(res.status).toBe(400);
  });

  it("closes task when Todoist returns ok", async () => {
    process.env.TODOIST_API_TOKEN = "token";
    mockFetch.mockResolvedValueOnce(new Response("", { status: 200 }));

    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ taskId: "abc" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; taskId: string };
    expect(json.ok).toBe(true);
    expect(json.taskId).toBe("abc");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.todoist.com/api/v1/tasks/abc/close",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
