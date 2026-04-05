export function buildStripeFailedUpdate(errorMsg: string) { return { error_message: errorMsg, processed_at: new Date().toISOString() }; }
export function buildStripeProcessedUpdate() { return { processed_at: new Date().toISOString() }; }
export async function claimStripeEvent() { return { claimed: true, duplicate: false, error: null }; }
/* eslint-disable @typescript-eslint/no-explicit-any */
export function verifyStripeWebhookSignature(opts: { stripe: { webhooks: { constructEvent: (payload: string, signature: string, secret: string) => any } }, payload: string, signature: string, webhookSecret: string }) { return opts.stripe.webhooks.constructEvent(opts.payload, opts.signature, opts.webhookSecret); }
