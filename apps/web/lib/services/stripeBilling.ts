import "server-only";

import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

function getIsMockMode(): boolean {
  return !process.env.STRIPE_SECRET_KEY || process.env.NODE_ENV === "test";
}

/** True when Stripe API calls use mock URLs (no secret, or Vitest `NODE_ENV=test`). */
export function isStripeBillingMockMode(): boolean {
  return getIsMockMode();
}

export function getStripeOrThrow(): Stripe {
  if (getIsMockMode()) {
    throw new Error("Stripe not configured");
  }
  if (!stripeSingleton) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("Stripe not configured");
    }
    stripeSingleton = new Stripe(secretKey, {
      apiVersion: "2026-02-25.clover",
    });
  }
  return stripeSingleton;
}

/**
 * Create a Checkout session for subscription (Bookiji-aligned params).
 */
export async function createSubscriptionCheckoutSession(
  priceId: string,
  userId: string,
  email: string,
  successUrl: string,
  cancelUrl: string,
  customerId?: string,
): Promise<string | null> {
  if (getIsMockMode()) {
    return `https://mock.checkout.session/${priceId}`;
  }
  const stripe = getStripeOrThrow();
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: userId,
    customer_email: customerId ? undefined : email,
    customer: customerId,
    metadata: { userId },
  };
  const session = await stripe.checkout.sessions.create(params);
  return session.url;
}

export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<string | null> {
  if (getIsMockMode()) {
    return `https://mock.billing.portal/${customerId}`;
  }
  const stripe = getStripeOrThrow();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url;
}
