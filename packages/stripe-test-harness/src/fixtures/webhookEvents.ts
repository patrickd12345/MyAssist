export const mockWebhookEvent = {
  id: "evt_test_123",
  type: "checkout.session.completed",
  data: { object: { id: "cs_test_123" } },
};

/** Matches Stripe `customer.subscription.updated` shape used by handleMyAssistStripeWebhook tests */
export const stripeSubscriptionUpdatedEvent = {
  id: "evt_test_1",
  type: "customer.subscription.updated",
  data: {
    object: {
      id: "sub_test",
      customer: "cus_test",
      status: "active",
      items: { data: [{ price: { id: "price_1" } }] },
    },
  },
};

export const stripeChargeSucceededEvent = {
  ...stripeSubscriptionUpdatedEvent,
  type: "charge.succeeded",
};
