import "server-only";

import {
  MYASSIST_BILLING_SUBSCRIPTIONS_TABLE,
  MYASSIST_SCHEMA,
} from "@/lib/myassistSchema";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/** Stripe subscription statuses treated as "paid" for product gating. */
const PAID_LIKE_STATUSES = new Set(["active", "trialing"]);

export type BillingEntitlementSnapshot = {
  userId: string;
  hasRow: boolean;
  isPaid: boolean;
  status: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  stripePriceId: string | null;
  updatedAt: string | null;
};

/**
 * Read normalized billing state from `myassist.billing_subscriptions` (entitlement source of truth).
 * Returns a safe snapshot when hosted storage is disabled or the user has no row.
 */
export async function getBillingEntitlementForUser(userId: string): Promise<BillingEntitlementSnapshot> {
  const trimmed = userId.trim();
  const empty: BillingEntitlementSnapshot = {
    userId: trimmed,
    hasRow: false,
    isPaid: false,
    status: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    currentPeriodEnd: null,
    stripePriceId: null,
    updatedAt: null,
  };
  if (!trimmed) {
    return empty;
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return empty;
  }

  const { data, error } = await admin
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_BILLING_SUBSCRIPTIONS_TABLE)
    .select(
      "stripe_customer_id, stripe_subscription_id, status, current_period_end, stripe_price_id, updated_at",
    )
    .eq("user_id", trimmed)
    .maybeSingle();

  if (error || !data) {
    return empty;
  }

  const row = data as Record<string, unknown>;
  const status = typeof row.status === "string" ? row.status : null;
  const isPaid = status != null && PAID_LIKE_STATUSES.has(status);

  return {
    userId: trimmed,
    hasRow: true,
    isPaid,
    status,
    stripeCustomerId: typeof row.stripe_customer_id === "string" ? row.stripe_customer_id : null,
    stripeSubscriptionId:
      typeof row.stripe_subscription_id === "string" ? row.stripe_subscription_id : null,
    currentPeriodEnd:
      typeof row.current_period_end === "string" ? row.current_period_end : null,
    stripePriceId: typeof row.stripe_price_id === "string" ? row.stripe_price_id : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}
