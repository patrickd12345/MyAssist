import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getSessionUserId: vi.fn(async () => null),
}));

describe("GET /api/daily-context auth guard", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("returns 401 without a session user", async () => {
    const res = await GET(new NextRequest("http://localhost/api/daily-context"));
    expect(res.status).toBe(401);
  });
});
