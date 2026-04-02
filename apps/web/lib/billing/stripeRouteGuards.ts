import "server-only";

import { jsonApiError } from "@/lib/api/error-contract";
import type { NextResponse } from "next/server";

import { isBillingEnabled } from "./config";

export function isProductionLikeDeployment(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

export function isStripeSecretConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

/**
 * In production-like deploys, billing routes must not return mock Stripe URLs.
 * Returns a JSON error response when billing is enabled but the secret is missing.
 */
export function billingLiveStripeGuard(requestId: string): NextResponse | null {
  if (!isBillingEnabled()) {
    return null;
  }
  if (!isProductionLikeDeployment()) {
    return null;
  }
  if (isStripeSecretConfigured()) {
    return null;
  }
  return jsonApiError(
    "billing_misconfigured",
    "STRIPE_SECRET_KEY is required when BILLING_ENABLED=true in production.",
    503,
    requestId,
  );
}
