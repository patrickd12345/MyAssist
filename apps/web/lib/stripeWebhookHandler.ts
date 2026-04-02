import "server-only";

import {
  buildStripeFailedUpdate,
  buildStripeProcessedUpdate,
  claimStripeEvent,
  verifyStripeWebhookSignature,
} from "@bookiji-inc/stripe-runtime";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isBillingEnabled } from "@/lib/billing/config";
import { getApiRequestId, jsonApiError } from "@/lib/api/error-contract";
import {
  MYASSIST_BILLING_SUBSCRIPTIONS_TABLE,
  MYASSIST_SCHEMA,
  MYASSIST_STRIPE_EVENT_LOG_TABLE,
} from "@/lib/myassistSchema";
import { getStripeOrThrow } from "@/lib/services/stripeBilling";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type MyAssistStripeWebhookResponse = {
  received?: boolean;
  duplicate?: boolean;
  error?: string;
};

function subscriptionPeriodEndIso(sub: Stripe.Subscription): string | null {
  const unix = (sub as unknown as { current_period_end?: number }).current_period_end;
  return typeof unix === "number" ? new Date(unix * 1000).toISOString() : null;
}

function subscriptionRowFromStripe(
  userId: string,
  customerId: string,
  sub: Stripe.Subscription,
): Record<string, unknown> {
  const priceId = sub.items.data[0]?.price?.id ?? null;
  const currentPeriodEnd = subscriptionPeriodEndIso(sub);
  return {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status: sub.status,
    current_period_end: currentPeriodEnd,
    stripe_price_id: priceId,
    updated_at: new Date().toISOString(),
  };
}

async function findUserIdForStripeSubscription(
  supabase: SupabaseClient,
  sub: Stripe.Subscription,
): Promise<string | null> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  const { data: bySub } = await supabase
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_BILLING_SUBSCRIPTIONS_TABLE)
    .select("user_id")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();
  if (bySub && typeof (bySub as { user_id?: string }).user_id === "string") {
    return (bySub as { user_id: string }).user_id;
  }
  const { data: byCust } = await supabase
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_BILLING_SUBSCRIPTIONS_TABLE)
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (byCust && typeof (byCust as { user_id?: string }).user_id === "string") {
    return (byCust as { user_id: string }).user_id;
  }
  return null;
}

async function handleCheckoutSessionCompleted(
  supabase: SupabaseClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const userId = session.client_reference_id;
  const customerRaw = session.customer;
  const customerId = typeof customerRaw === "string" ? customerRaw : customerRaw?.id;
  const subscriptionRaw = session.subscription;
  const subscriptionId =
    typeof subscriptionRaw === "string" ? subscriptionRaw : subscriptionRaw?.id;
  if (!userId || !customerId || !subscriptionId) {
    return;
  }
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const { error } = await supabase
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_BILLING_SUBSCRIPTIONS_TABLE)
    .upsert(subscriptionRowFromStripe(userId, customerId, sub), { onConflict: "user_id" });
  if (error) {
    throw new Error(error.message);
  }
}

async function handleSubscriptionChange(
  supabase: SupabaseClient,
  sub: Stripe.Subscription,
): Promise<void> {
  const userId = await findUserIdForStripeSubscription(supabase, sub);
  if (!userId) {
    return;
  }
  const customerRaw = sub.customer;
  const customerId = typeof customerRaw === "string" ? customerRaw : customerRaw?.id;
  if (!customerId) {
    return;
  }
  const { error } = await supabase
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_BILLING_SUBSCRIPTIONS_TABLE)
    .upsert(subscriptionRowFromStripe(userId, customerId, sub), { onConflict: "user_id" });
  if (error) {
    throw new Error(error.message);
  }
}

export async function handleMyAssistStripeWebhook(request: NextRequest): Promise<NextResponse> {
  const requestId = getApiRequestId(request);
  const admin = getSupabaseAdmin();
  if (!admin) {
    return jsonApiError("billing_unavailable", "Hosted storage is not configured.", 503, requestId);
  }
  if (!isBillingEnabled()) {
    return jsonApiError("billing_disabled", "Billing is disabled.", 503, requestId);
  }
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return jsonApiError("billing_misconfigured", "Missing STRIPE_WEBHOOK_SECRET.", 500, requestId);
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return jsonApiError("missing_signature", "No signature", 400, requestId);
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripeOrThrow();
    event = verifyStripeWebhookSignature({
      stripe,
      payload: body,
      signature,
      webhookSecret,
    });
  } catch {
    return jsonApiError("invalid_signature", "Invalid signature", 400, requestId);
  }

  const tryClaimEvent = async (eventId: string, eventType: string): Promise<boolean> => {
    const result = await claimStripeEvent({
      eventId,
      eventType,
      product: "myassist",
      accountScope: "myassist",
      insertClaim: async (claim) =>
        admin.schema(MYASSIST_SCHEMA).from(MYASSIST_STRIPE_EVENT_LOG_TABLE).insert({
          id: eventId,
          type: eventType,
          ...claim,
        }),
    });
    if (result.error) {
      if (result.duplicate) {
        return false;
      }
      return false;
    }
    return result.claimed;
  };

  const markEventProcessed = async (eventId: string): Promise<void> => {
    await admin
      .schema(MYASSIST_SCHEMA)
      .from(MYASSIST_STRIPE_EVENT_LOG_TABLE)
      .update(buildStripeProcessedUpdate())
      .eq("id", eventId);
  };

  const markEventFailed = async (eventId: string, errorMessage: string): Promise<void> => {
    await admin
      .schema(MYASSIST_SCHEMA)
      .from(MYASSIST_STRIPE_EVENT_LOG_TABLE)
      .update(buildStripeFailedUpdate(errorMessage))
      .eq("id", eventId);
  };

  try {
    if (!(await tryClaimEvent(event.id, event.type))) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const stripe = getStripeOrThrow();

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription") {
          await handleCheckoutSessionCompleted(admin, stripe, session);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(admin, sub);
        break;
      }
      default:
        break;
    }

    await markEventProcessed(event.id);
    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    const safeMessage = err instanceof Error ? err.message : "Webhook handler failed";
    await markEventFailed(event.id, safeMessage);
    return jsonApiError(
      "webhook_handler_failed",
      "Webhook handler failed",
      500,
      requestId,
      safeMessage,
    ) as NextResponse;
  }
}
