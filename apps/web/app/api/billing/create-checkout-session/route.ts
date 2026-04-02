import { NextResponse } from "next/server";

import { isBillingEnabled } from "@/lib/billing/config";
import { getApiRequestId, jsonApiError } from "@/lib/api/error-contract";
import {
  MYASSIST_BILLING_SUBSCRIPTIONS_TABLE,
  MYASSIST_SCHEMA,
} from "@/lib/myassistSchema";
import { createSubscriptionCheckoutSession } from "@/lib/services/stripeBilling";
import { getSessionUserId } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserById } from "@/lib/userStore";

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

    const b = body as Record<string, unknown>;
    const successUrl = typeof b.successUrl === "string" ? b.successUrl.trim() : "";
    const cancelUrl = typeof b.cancelUrl === "string" ? b.cancelUrl.trim() : "";
    const fromBody = typeof b.priceId === "string" ? b.priceId.trim() : "";
    const priceId =
      fromBody ||
      (process.env.MYASSIST_STRIPE_PRICE_ID || "").trim() ||
      (process.env.STRIPE_PRICE_ID || "").trim();

    if (!priceId || !successUrl || !cancelUrl) {
      return jsonApiError("missing_parameters", "Missing parameters", 400, requestId);
    }

    const profile = await getUserById(userId);
    if (!profile) {
      return jsonApiError("profile_not_found", "Profile not found", 404, requestId);
    }

    const { data: existing } = await admin
      .schema(MYASSIST_SCHEMA)
      .from(MYASSIST_BILLING_SUBSCRIPTIONS_TABLE)
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    const existingCustomerId =
      existing && typeof (existing as { stripe_customer_id?: string | null }).stripe_customer_id === "string"
        ? (existing as { stripe_customer_id: string }).stripe_customer_id
        : undefined;

    const url = await createSubscriptionCheckoutSession(
      priceId,
      userId,
      profile.email,
      successUrl,
      cancelUrl,
      existingCustomerId || undefined,
    );

    if (!url) {
      return jsonApiError("checkout_session_failed", "Failed to create session", 500, requestId);
    }

    return NextResponse.json({ url });
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return jsonApiError("internal_error", "Internal Server Error", 500, requestId, details);
  }
}
