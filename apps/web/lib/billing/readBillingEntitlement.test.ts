import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSupabaseAdmin = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseAdmin", () => ({
  getSupabaseAdmin: mockGetSupabaseAdmin,
}));

describe("getBillingEntitlementForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty snapshot when supabase is unavailable", async () => {
    mockGetSupabaseAdmin.mockReturnValue(null);
    const { getBillingEntitlementForUser } = await import("./readBillingEntitlement");
    const r = await getBillingEntitlementForUser("550e8400-e29b-41d4-a716-446655440000");
    expect(r.hasRow).toBe(false);
    expect(r.isPaid).toBe(false);
  });

  it("marks active subscription as paid", async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      schema: vi.fn(() => ({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  stripe_customer_id: "cus_1",
                  stripe_subscription_id: "sub_1",
                  status: "active",
                  current_period_end: "2026-12-31T00:00:00.000Z",
                  stripe_price_id: "price_1",
                  updated_at: "2026-01-01T00:00:00.000Z",
                },
                error: null,
              })),
            })),
          })),
        })),
      })),
    });
    const { getBillingEntitlementForUser } = await import("./readBillingEntitlement");
    const r = await getBillingEntitlementForUser("550e8400-e29b-41d4-a716-446655440000");
    expect(r.hasRow).toBe(true);
    expect(r.isPaid).toBe(true);
    expect(r.status).toBe("active");
  });

  it("does not mark canceled as paid", async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      schema: vi.fn(() => ({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  stripe_customer_id: "cus_1",
                  stripe_subscription_id: "sub_1",
                  status: "canceled",
                  current_period_end: null,
                  stripe_price_id: null,
                  updated_at: "2026-01-01T00:00:00.000Z",
                },
                error: null,
              })),
            })),
          })),
        })),
      })),
    });
    const { getBillingEntitlementForUser } = await import("./readBillingEntitlement");
    const r = await getBillingEntitlementForUser("550e8400-e29b-41d4-a716-446655440000");
    expect(r.hasRow).toBe(true);
    expect(r.isPaid).toBe(false);
  });
});
