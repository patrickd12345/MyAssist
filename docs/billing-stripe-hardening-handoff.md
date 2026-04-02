# Stripe billing hardening — handoff

**Status:** Hardening applied in-repo (webhook claim fix, production Stripe guard, entitlement helper, runbook, tests). Use [`billing-stripe-runbook.md`](./billing-stripe-runbook.md) for operations.

Historical note: the workspace briefly blocked non-markdown edits; the checklist below documents what was assessed.

## Phase 1 — Repo assessment (current state)

### 1. Billing data model

- **`myassist.billing_subscriptions`** ([`20260402141000_myassist_stripe_billing.sql`](../supabase/migrations/20260402141000_myassist_stripe_billing.sql)): PK `user_id` → `app_users`, optional `stripe_customer_id`, `stripe_subscription_id`, `status` (default `inactive`), `current_period_end`, `stripe_price_id`, `updated_at`. Partial indexes on customer and subscription id for lookup.
- **`myassist.stripe_event_log`**: PK `id` (= Stripe event id), legacy `type`, `event_id` UNIQUE, `event_type`, `received_at`, `processed_at`, `status`, `error`, `product`, `account_scope`. Supports `claimStripeEvent` inserts.
- **Idempotency**: UNIQUE on `event_id` prevents duplicate claims; **bug**: `tryClaimEvent` currently treats any insert error as duplicate (should distinguish `duplicate` vs `failed`).

### 2. Routes

- Checkout / portal / webhook: implemented as in prior work; webhook uses `request.text()` before verify (correct).

### 3. Stripe runtime

- `isBillingEnabled`, `claimStripeEvent`, `verifyStripeWebhookSignature` usage is aligned; **gap**: if idempotency insert fails for a non-duplicate reason, response should not be `{ duplicate: true }`.

### 4. Hosted vs local

- `stripeBilling.ts`: mock mode when `STRIPE_SECRET_KEY` missing or `NODE_ENV=test`. **Risk**: `BILLING_ENABLED=true` without secret in production could return mock URLs from checkout — mitigate with **production-only guard** on billing routes.

### 5. Entitlement

- Writes only in `stripeWebhookHandler`; **no** shared read helper yet — add thin `getBillingEntitlementForUser`.

### 6. Migrations

- Canonical: **`20260402141000_myassist_stripe_billing.sql`** only.
- Remove **`20260402135156_myassist_stripe_billing.sql`** when file is not locked (delete or `git rm`).

---

## Phase 2–6 — Implementation checklist

1. **Webhook** (`stripeWebhookHandler.ts`): Return `ClaimResult` `claimed | duplicate | failed`; on `duplicate` → 200 `{ duplicate: true }`; on `failed` → 503 `idempotency_claim_failed`; before verify, if `BILLING_ENABLED` and `!STRIPE_SECRET_KEY?.trim()` → 503 `billing_misconfigured` (no secret text in logs).
2. **Routes** (`create-checkout-session`, `portal`): After billing checks, call `billingLiveStripeGuard(requestId)` from new `lib/billing/stripeRouteGuards.ts` (production + billing enabled + missing secret → 503).
3. **New files**: `stripeRouteGuards.ts`, `readBillingEntitlement.ts` (see suggested code in Agent session).
4. **stripeBilling.ts**: Export `isStripeBillingMockMode()` (= existing mock predicate) for docs/tests.
5. **Optional**: `handleCheckoutSessionCompleted` early-return if `client_reference_id` is not a plausible UUID.
6. **Docs**: `docs/billing-stripe-runbook.md` (operational checklist); extend `commercial-pilot-readiness.md` + `apps/web/README.md`; `PRODUCT_SCOPE` only if webhook path / entitlement need one line.
7. **Tests**: Webhook duplicate vs failed; unsupported event still 200 processed; billing guard; entitlement helper; run `tsc`, `lint`, `vitest`.

---

## Manual hosted steps (unchanged)

- Stripe Dashboard: webhook URL `…/api/payments/webhook`, signing secret → `STRIPE_WEBHOOK_SECRET`.
- Env: `BILLING_ENABLED=true`, `STRIPE_SECRET_KEY`, default price `MYASSIST_STRIPE_PRICE_ID` or `STRIPE_PRICE_ID`, Supabase service role for `myassist` writes.
- Apply migration: `supabase db push` (fix local `config.toml` if CLI parse fails).
