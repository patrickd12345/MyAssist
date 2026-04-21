export function buildStripeWebhookRequest(payload: any, signature: string): Request {
  return new Request('https://mock.endpoint', {
    method: 'POST',
    headers: {
      'stripe-signature': signature,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
}
