import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { getSessionUserId } from "@/lib/session";

vi.mock("@/lib/session", () => ({
  getSessionUserId: vi.fn(),
}));

describe("GET /api/demo-script", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSessionUserId).mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
    expect(json.code).toBe("unauthorized");
  });

  it("returns JSON walkthrough when authenticated", async () => {
    vi.mocked(getSessionUserId).mockResolvedValueOnce("user-123");

    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { title: string; steps: unknown[] };
    expect(json.title).toBe("MyAssist Demo Walkthrough");
    expect(Array.isArray(json.steps)).toBe(true);
    expect(json.steps.length).toBe(6);
  });
});
