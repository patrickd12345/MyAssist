import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/session", () => ({
  getSessionUserId: vi.fn(),
}));

describe("GET /api/integrations/status", () => {
  it("returns 401 when unauthenticated", async () => {
    const { getSessionUserId } = await import("@/lib/session");
    vi.mocked(getSessionUserId).mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Unauthorized");
  });
});
