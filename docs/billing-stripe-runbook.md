# MyAssist Stripe billing — operational runbook

Single canonical webhook path: **`POST /api/payments/webhook`** (do not add alternate routes).

Entitlement source of truth: **`myassist.billing_subscriptions`** (not `platform.entitlements` for credential users). Optional read helper: `getBillingEntitlementForUser` in [`apps/web/lib/billing/readBillingEntitlement.ts`](../apps/web/lib/billing/readBillingEntitlement.ts).

## 1. Apply database migration

From the repo root (MyAssist product):

```bash
cd products/MyAssist
npx supabase db push
```

Canonical migration file: [`supabase/migrations/20260402141000_myassist_stripe_billing.sql`](../supabase/migrations/20260402141000_myassist_stripe_billing.sql).

If an older duplicate migration `20260402135156_myassist_stripe_billing.sql` still exists in the tree, delete it so only `20260402141000_*` remains (it may be locked while an editor holds the file open).

If the Supabase CLI fails with **config parse errors** (invalid keys in `supabase/config.toml`), fix or regenerate config per Supabase docs, or apply the same SQL in the Supabase SQL editor as a last resort (still prefer CLI for repeatability).

## 2. Stripe Dashboard

1. **Developers → Webhooks → Add endpoint**  
   - URL: `https://<your-host>/api/payments/webhook`  
   - Events: at minimum `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` (subscription lifecycle).

2. Copy the **Signing secret** into server env: **`STRIPE_WEBHOOK_SECRET`**.

3. Create **Product** and **Price** (subscription); copy the **Price id** (e.g. `price_...`).

## 3. Server environment (hosted)

| Variable | Purpose |
|----------|---------|
| `BILLING_ENABLED` | Set to `true` to enable billing routes and webhook processing. |
| `STRIPE_SECRET_KEY` | Server-only Stripe secret API key. |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret from Dashboard. |
| `MYASSIST_STRIPE_PRICE_ID` or `STRIPE_PRICE_ID` | Default price id when the client does not send `priceId`). |
| `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (or service role) | Required for `myassist` schema writes. |

**Local / dev:** If `STRIPE_SECRET_KEY` is unset, checkout and portal return **mock URLs** (see [`stripeBilling.ts`](../apps/web/lib/services/stripeBilling.ts) and `isStripeBillingMockMode()`). **Production-like** deploys (`NODE_ENV=production` or `VERCEL_ENV=production`) with `BILLING_ENABLED=true` **require** `STRIPE_SECRET_KEY` or checkout/portal return **503** (`billing_misconfigured`).

Validation: `pnpm run check:env` / `pnpm run check:env:prod` from `apps/web`.

## 4. Hosted smoke test (manual)

1. Sign in as a test user with a row in `myassist.app_users`.
2. `POST /api/billing/create-checkout-session` with `priceId` (or rely on env default), `successUrl`, `cancelUrl` — expect `{ url }`.
3. Complete Checkout in Stripe test mode.
4. Confirm **`myassist.stripe_event_log`** has a row for the event id (idempotent replay returns `{ received: true, duplicate: true }`).
5. Confirm **`myassist.billing_subscriptions`** updated for the user (`status`, `stripe_customer_id`, etc.).
6. `POST /api/billing/portal` with `returnUrl` — expect `{ url }` to Stripe Customer Portal.

## 5. Troubleshooting

| Symptom | Check |
|--------|--------|
| Webhook 400 `invalid_signature` | `STRIPE_WEBHOOK_SECRET` matches endpoint; raw body not modified by proxies. |
| Webhook 503 `idempotency_claim_failed` | DB reachable; `myassist.stripe_event_log` exists and RLS/service role allows insert. |
| Checkout 503 `billing_misconfigured` in prod | Set `STRIPE_SECRET_KEY`, or `BILLING_ENABLED=false` for non-billing deploys. |

## 6. Manual steps that require a real Stripe account

Live mode keys, production webhooks, and PCI-related settings must be configured in the Stripe Dashboard; this repo does not store or rotate secrets.
