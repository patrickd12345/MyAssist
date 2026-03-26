import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getSessionUserId: vi.fn(async () => null),
}));

describe("POST /api/actions auth guard", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("returns 401 without a session user", async () => {
    const res = await POST(
      new Request("http://localhost/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "email_to_task", sourceId: "m1" }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
