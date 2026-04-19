/** Row shape under `stripe.billing_subscription` used by MyAssist entitlement reads */

export const myAssistActivePaidRow = {
  stripe_customer_id: "cus_1",
  stripe_subscription_id: "sub_1",
  status: "active",
  current_period_end: "2026-12-31T00:00:00.000Z",
  stripe_price_id: "price_1",
  updated_at: "2026-01-01T00:00:00.000Z",
};

export const myAssistCanceledRow = {
  stripe_customer_id: "cus_1",
  stripe_subscription_id: "sub_1",
  status: "canceled",
  current_period_end: null,
  stripe_price_id: null,
  updated_at: "2026-01-01T00:00:00.000Z",
};
