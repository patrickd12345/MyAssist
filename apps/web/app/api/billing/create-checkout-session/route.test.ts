import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSessionUserId = vi.hoisted(() => vi.fn());
const mockCreateSubscriptionCheckoutSession = vi.hoisted(() =>
  vi.fn(async () => "http://checkout.test"),
);

vi.mock("@/lib/session", () => ({
  getSessionUserId: mockGetSessionUserId,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    schema: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { stripe_customer_id: "cus_1" }, error: null })),
          })),
        })),
      })),
    })),
  })),
}));

vi.mock("@/lib/userStore", () => ({
  getUserById: vi.fn(async () => ({ id: "user-1", email: "u@test.com" })),
}));

vi.mock("@/lib/services/stripeBilling", () => ({
  createSubscriptionCheckoutSession: mockCreateSubscriptionCheckoutSession,
}));

describe("POST /api/billing/create-checkout-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BILLING_ENABLED = "true";
  });

  it("returns 401 when no user", async () => {
    mockGetSessionUserId.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ priceId: "p", successUrl: "https://ok", cancelUrl: "https://cancel" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when required params are missing", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 503 when billing is disabled", async () => {
    process.env.BILLING_ENABLED = "false";
    mockGetSessionUserId.mockResolvedValue("user-1");
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": "req_1" },
        body: JSON.stringify({ priceId: "p", successUrl: "https://ok", cancelUrl: "https://cancel" }),
      }),
    );
    const json = (await res.json()) as { code: string; requestId: string };
    expect(res.status).toBe(503);
    expect(json.code).toBe("billing_disabled");
    expect(json.requestId).toBe("req_1");
  });

  it("returns checkout url when billing enabled", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ priceId: "price_1", successUrl: "https://ok", cancelUrl: "https://cancel" }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string };
    expect(json.url).toBe("http://checkout.test");
    expect(mockCreateSubscriptionCheckoutSession).toHaveBeenCalled();
  });
});
