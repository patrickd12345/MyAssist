# Product Technical Scope

Product: MyAssist  
Type: AI assistant

## Platform Standards Applicability

| Capability | Status | Notes |
|------------|--------|-------|
| AI Runtime | Applicable | AI execution is a core product surface and uses shared runtime patterns. |
| Stripe Runtime | Applicable | Checkout, Customer Portal, and Stripe webhooks when `BILLING_ENABLED=true`; uses `@bookiji-inc/stripe-runtime` for idempotent webhook processing. |
| CI Baseline | Partial | CI exists, but baseline enforcement is still limited and web-scoped. |
| Env Contract | Partial | Canonical env work exists, but alias handling and validation are not complete. |
| Observability | Partial | Logging helpers exist, but observability is not applied across all API paths. |
| Feature Flags | Partial | Env-driven toggles exist, but flag governance is not standardized. |
| Error Contract | Partial | Canonical error handling exists, but adoption is still limited to part of the API surface. |

## Architecture Intent

Assistant-focused product with AI runtime in scope and an optional billing surface (Stripe Checkout, portal, webhooks) for subscription access. **Entitlement authority** for paid status is **`myassist.billing_subscriptions`** (not `platform.entitlements`), because MyAssist credential users live in `myassist.app_users` and are not guaranteed to exist in `auth.users`.

## Out of Scope

- Marketplace or multi-vendor subscription design beyond a single MyAssist subscription product
- Using `platform.entitlements` as the write path for credential-auth users without a documented identity bridge to `auth.users`

## Audit Instructions

Future audit agents must:

- Read this file first
- Treat N/A as intentional
- Treat Partial as real gaps
- Avoid proposing out-of-scope architecture
