import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetSupabaseAdmin = vi.hoisted(() => vi.fn());
const mockGetStripeOrThrow = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseAdmin", () => ({
  getSupabaseAdmin: mockGetSupabaseAdmin,
}));

vi.mock("@/lib/services/stripeBilling", () => ({
  getStripeOrThrow: mockGetStripeOrThrow,
}));

describe("handleMyAssistStripeWebhook", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.BILLING_ENABLED = "true";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mockGetSupabaseAdmin.mockReturnValue({
      schema: vi.fn(() => ({
        from: vi.fn(() => ({
          insert: vi.fn(async () => ({ error: null })),
          update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        })),
      })),
    });
    mockGetStripeOrThrow.mockReturnValue({
      webhooks: {
        constructEvent: vi.fn(() => {
          throw new Error("invalid signature");
        }),
      },
    });
  });

  it("returns 503 when supabase admin is unavailable", async () => {
    mockGetSupabaseAdmin.mockReturnValue(null);
    const { handleMyAssistStripeWebhook } = await import("./stripeWebhookHandler");
    const req = new NextRequest("http://localhost/api/payments/webhook", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "t=1,v1=abc" },
    });
    const res = await handleMyAssistStripeWebhook(req);
    expect(res.status).toBe(503);
  });

  it("returns 400 when stripe signature is invalid", async () => {
    const { handleMyAssistStripeWebhook } = await import("./stripeWebhookHandler");
    const req = new NextRequest("http://localhost/api/payments/webhook", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "t=1,v1=abc" },
    });
    const res = await handleMyAssistStripeWebhook(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("invalid_signature");
  });

  it("returns 400 when stripe-signature header is missing", async () => {
    mockGetStripeOrThrow.mockReturnValue({});
    const { handleMyAssistStripeWebhook } = await import("./stripeWebhookHandler");
    const req = new NextRequest("http://localhost/api/payments/webhook", {
      method: "POST",
      body: "{}",
    });
    const res = await handleMyAssistStripeWebhook(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("missing_signature");
  });
});
