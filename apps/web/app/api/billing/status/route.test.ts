import { describe, expect, it, beforeEach, vi } from "vitest";

const mockIsBillingEnabled = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/billing/config", () => ({
  isBillingEnabled: mockIsBillingEnabled,
}));

describe("GET /api/billing/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsBillingEnabled.mockReturnValue(true);
  });

  it("returns enabled true when billing is on", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { enabled: boolean };
    expect(json.enabled).toBe(true);
  });

  it("returns enabled false when billing is off", async () => {
    mockIsBillingEnabled.mockReturnValue(false);
    const { GET } = await import("./route");
    const res = await GET();
    const json = (await res.json()) as { enabled: boolean };
    expect(json.enabled).toBe(false);
  });
});
