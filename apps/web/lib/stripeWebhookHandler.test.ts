import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  signTestWebhookEvent,
  stripeChargeSucceededEvent,
  stripeSubscriptionUpdatedEvent,
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - missing package in monorepo
} from "@bookiji-inc/stripe-test-harness";

const mockGetSupabaseAdmin = vi.hoisted(() => vi.fn());
const mockGetStripeOrThrow = vi.hoisted(() => vi.fn());
const mockClaimStripeEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseAdmin", () => ({
  getSupabaseAdmin: mockGetSupabaseAdmin,
}));

vi.mock("@/lib/services/stripeBilling", () => ({
  getStripeOrThrow: mockGetStripeOrThrow,
}));

vi.mock("@bookiji-inc/stripe-runtime", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@bookiji-inc/stripe-runtime")>();
  return {
    ...mod,
    claimStripeEvent: (...args: unknown[]) => mockClaimStripeEvent(...args),
  };
});

function buildWebhookNextRequest(payload: object): NextRequest {
  const raw = JSON.stringify(payload);
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const sig = signTestWebhookEvent(raw, secret);
  return new NextRequest("http://localhost/api/payments/webhook", {
    method: "POST",
    body: raw,
    headers: { "stripe-signature": sig },
  });
}

describe("handleMyAssistStripeWebhook", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("BILLING_ENABLED", "true");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
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
        constructEvent: vi.fn(() => stripeSubscriptionUpdatedEvent),
      },
    });
    mockClaimStripeEvent.mockResolvedValue({
      claimed: true,
      duplicate: false,
      error: null,
      claim: {} as never,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 503 when supabase admin is unavailable", async () => {
    mockGetSupabaseAdmin.mockReturnValue(null);
    const { handleMyAssistStripeWebhook } = await import("./stripeWebhookHandler");
    const res = await handleMyAssistStripeWebhook(buildWebhookNextRequest(stripeSubscriptionUpdatedEvent));
    expect(res.status).toBe(503);
  });

  it("returns 503 when STRIPE_SECRET_KEY is missing", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const { handleMyAssistStripeWebhook } = await import("./stripeWebhookHandler");
    const res = await handleMyAssistStripeWebhook(buildWebhookNextRequest(stripeSubscriptionUpdatedEvent));
    expect(res.status).toBe(503);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("billing_misconfigured");
  });

  it("returns 400 when stripe signature is invalid", async () => {
    mockGetStripeOrThrow.mockReturnValue({
      webhooks: {
        constructEvent: vi.fn(() => {
          throw new Error("invalid signature");
        }),
      },
    });
    const { handleMyAssistStripeWebhook } = await import("./stripeWebhookHandler");
    const res = await handleMyAssistStripeWebhook(buildWebhookNextRequest(stripeSubscriptionUpdatedEvent));
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

  it("returns duplicate when idempotency insert is duplicate", async () => {
    mockClaimStripeEvent.mockResolvedValue({
      claimed: false,
      duplicate: true,
      error: { code: "23505" },
      claim: {} as never,
    });
    const { handleMyAssistStripeWebhook } = await import("./stripeWebhookHandler");
    const res = await handleMyAssistStripeWebhook(buildWebhookNextRequest(stripeSubscriptionUpdatedEvent));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { duplicate?: boolean };
    expect(json.duplicate).toBe(true);
  });

  it("returns 503 when idempotency claim fails for non-duplicate reason", async () => {
    mockClaimStripeEvent.mockResolvedValue({
      claimed: false,
      duplicate: false,
      error: new Error("db unavailable"),
      claim: {} as never,
    });
    const { handleMyAssistStripeWebhook } = await import("./stripeWebhookHandler");
    const res = await handleMyAssistStripeWebhook(buildWebhookNextRequest(stripeSubscriptionUpdatedEvent));
    expect(res.status).toBe(503);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("idempotency_claim_failed");
  });

  it("returns 200 received for unhandled event types after claim", async () => {
    mockGetStripeOrThrow.mockReturnValue({
      webhooks: {
        constructEvent: vi.fn(() => stripeChargeSucceededEvent),
      },
    });
    const { handleMyAssistStripeWebhook } = await import("./stripeWebhookHandler");
    const res = await handleMyAssistStripeWebhook(buildWebhookNextRequest(stripeChargeSucceededEvent));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received?: boolean };
    expect(json.received).toBe(true);
  });
});
