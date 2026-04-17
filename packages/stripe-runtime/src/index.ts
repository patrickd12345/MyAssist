import type Stripe from "stripe";

export type StripeSignatureVerifyInput = {
  stripe: Stripe;
  payload: string;
  signature: string;
  webhookSecret: string;
};

export function verifyStripeWebhookSignature(input: StripeSignatureVerifyInput): Stripe.Event {
  const { stripe, payload, signature, webhookSecret } = input;
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

export function isBillingEnabled(env: Record<string, string | undefined>): boolean {
  const value = env.BILLING_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export type StripeEventClaim = {
  event_id: string;
  event_type: string;
  status: "processing";
  product: string;
  account_scope: string;
  processing_started_at: string;
  processing_completed_at: null;
  error_message: null;
};

export type ClaimStripeEventInput = {
  eventId: string;
  eventType: string;
  product: string;
  accountScope: string;
  insertClaim: (claim: StripeEventClaim) => Promise<{ error: unknown | null }>;
};

export type ClaimStripeEventResult = {
  claimed: boolean;
  duplicate: boolean;
  error: unknown | null;
  claim: StripeEventClaim;
};

function isPgDuplicateError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const record = err as { code?: unknown };
  return record.code === "23505";
}

export async function claimStripeEvent(input: ClaimStripeEventInput): Promise<ClaimStripeEventResult> {
  const claim: StripeEventClaim = {
    event_id: input.eventId,
    event_type: input.eventType,
    status: "processing",
    product: input.product,
    account_scope: input.accountScope,
    processing_started_at: new Date().toISOString(),
    processing_completed_at: null,
    error_message: null,
  };
  const { error } = await input.insertClaim(claim);
  if (!error) {
    return { claimed: true, duplicate: false, error: null, claim };
  }
  return {
    claimed: false,
    duplicate: isPgDuplicateError(error),
    error,
    claim,
  };
}

export function buildStripeProcessedUpdate(): {
  status: "processed";
  processing_completed_at: string;
  error_message: null;
} {
  return {
    status: "processed",
    processing_completed_at: new Date().toISOString(),
    error_message: null,
  };
}

export function buildStripeFailedUpdate(errorMessage: string): {
  status: "failed";
  processing_completed_at: string;
  error_message: string;
} {
  return {
    status: "failed",
    processing_completed_at: new Date().toISOString(),
    error_message: errorMessage,
  };
}
