export function buildStripeFailedUpdate(errorMsg: string) { return { error_message: errorMsg, processed_at: new Date().toISOString() }; }
export function buildStripeProcessedUpdate() { return { processed_at: new Date().toISOString() }; }
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
export async function claimStripeEvent(opts: {
  eventId: string;
  eventType: string;
  product: string;
  accountScope: string;
  insertClaim: (claim: any) => Promise<any>;
}) { return { claimed: true, duplicate: false, error: null }; }
export function verifyStripeWebhookSignature(opts: { stripe: { webhooks: { constructEvent: (payload: string, signature: string, secret: string) => any } }, payload: string, signature: string, webhookSecret: string }) { return opts.stripe.webhooks.constructEvent(opts.payload, opts.signature, opts.webhookSecret); }
