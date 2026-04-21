export const mockStripeClient = {
  checkout: {
    sessions: {
      create: () => Promise.resolve({ url: 'https://mock.checkout.session/cs_test_123' })
    }
  },
  subscriptions: {
    retrieve: () => Promise.resolve({ status: 'active' })
  }
}
