export const mockCheckoutSession = {
  id: "cs_test_123",
  object: "checkout.session",
  url: "https://mock.checkout.session/cs_test_123",
};

/** URLs returned by mocked MyAssist Stripe billing helpers in Vitest route tests */
export const mockBillingCheckoutRedirectUrl = "http://checkout.test";
export const mockBillingPortalRedirectUrl = "http://portal.test";
