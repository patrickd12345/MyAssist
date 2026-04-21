import { beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error - missing package in monorepo
import { myAssistActivePaidRow, myAssistCanceledRow } from "@bookiji-inc/stripe-test-harness";

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
                data: myAssistActivePaidRow,
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
                data: myAssistCanceledRow,
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
