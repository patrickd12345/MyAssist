import { NextResponse } from "next/server";

import { isBillingEnabled } from "@/lib/billing/config";
import { billingLiveStripeGuard } from "@/lib/billing/stripeRouteGuards";
import { getApiRequestId, jsonApiError } from "@/lib/api/error-contract";
import {
  MYASSIST_BILLING_SUBSCRIPTIONS_TABLE,
  MYASSIST_SCHEMA,
} from "@/lib/myassistSchema";
import { createBillingPortalSession } from "@/lib/services/stripeBilling";
import { getSessionUserId } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  const requestId = getApiRequestId(req);
  try {
    if (!isBillingEnabled()) {
      return jsonApiError("billing_disabled", "Billing is disabled.", 503, requestId);
    }
    const admin = getSupabaseAdmin();
    if (!admin) {
      return jsonApiError("billing_unavailable", "Hosted storage is not configured.", 503, requestId);
    }

    const liveGuard = billingLiveStripeGuard(requestId);
    if (liveGuard) {
      return liveGuard;
    }

    const userId = await getSessionUserId();
    if (!userId) {
      return jsonApiError("unauthorized", "Unauthorized", 401, requestId);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonApiError("invalid_json", "Invalid JSON body", 400, requestId);
    }

    const returnUrl = typeof (body as { returnUrl?: unknown }).returnUrl === "string"
      ? (body as { returnUrl: string }).returnUrl.trim()
      : "";
    if (!returnUrl) {
      return jsonApiError("missing_parameters", "Missing parameters", 400, requestId);
    }

    const { data: row } = await admin
      .schema(MYASSIST_SCHEMA)
      .from(MYASSIST_BILLING_SUBSCRIPTIONS_TABLE)
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    const customerId =
      row && typeof (row as { stripe_customer_id?: string | null }).stripe_customer_id === "string"
        ? (row as { stripe_customer_id: string }).stripe_customer_id
        : null;

    if (!customerId) {
      return jsonApiError("subscription_not_found", "No subscription found", 404, requestId);
    }

    const url = await createBillingPortalSession(customerId, returnUrl);
    if (!url) {
      return jsonApiError("billing_portal_failed", "Failed to create portal session", 500, requestId);
    }

    return NextResponse.json({ url });
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return jsonApiError("internal_error", "Internal Server Error", 500, requestId, details);
  }
}
