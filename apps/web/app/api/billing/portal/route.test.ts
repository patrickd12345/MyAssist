import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-ignore - missing package in monorepo
import {
  mockBillingPortalRedirectUrl,
  stubDefaultBillingRouteEnv,
  stubProductionLikeBillingMisconfiguredEnv,
// @ts-expect-error - missing package in monorepo
} from "@bookiji-inc/stripe-test-harness";

const mockGetSessionUserId = vi.hoisted(() => vi.fn());
const mockCreateBillingPortalSession = vi.hoisted(() =>
  vi.fn(async () => mockBillingPortalRedirectUrl),
);
const mockGetSupabaseAdmin = vi.hoisted(() =>
  vi.fn(() => ({
    schema: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { stripe_customer_id: "cus_x" }, error: null })),
          })),
        })),
      })),
    })),
  })),
);

vi.mock("@/lib/session", () => ({
  getSessionUserId: mockGetSessionUserId,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getSupabaseAdmin: mockGetSupabaseAdmin,
}));

vi.mock("@/lib/services/stripeBilling", () => ({
  createBillingPortalSession: mockCreateBillingPortalSession,
}));

describe("POST /api/billing/portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubDefaultBillingRouteEnv(vi);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 when no user", async () => {
    mockGetSessionUserId.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/billing/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ returnUrl: "https://return" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when no stripe customer on file", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    mockGetSupabaseAdmin.mockReturnValueOnce({
      schema: vi.fn(() => ({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { stripe_customer_id: null }, error: null })),
            })),
          })),
        })),
      })),
    } as never);
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/billing/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ returnUrl: "https://return" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 503 in production-like deploy when STRIPE_SECRET_KEY is missing", async () => {
    stubProductionLikeBillingMisconfiguredEnv(vi);
    mockGetSessionUserId.mockResolvedValue("550e8400-e29b-41d4-a716-446655440002");
    vi.resetModules();
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/billing/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ returnUrl: "https://return" }),
      }),
    );
    expect(res.status).toBe(503);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("billing_misconfigured");
  });

  it("returns portal url when customer exists", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/billing/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ returnUrl: "https://return" }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string };
    expect(json.url).toBe(mockBillingPortalRedirectUrl);
  });
});
