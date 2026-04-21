export function assertStripeTestMode() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Test harness cannot be used in production')
  }
}
