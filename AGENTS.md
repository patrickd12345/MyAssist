# BKI-043 Workstream D

## Product Identity
- MyAssist is a personal operations assistant over live provider systems (Gmail, Google Calendar, Todoist).
- Providers stay canonical; MyAssist is orchestration + assistant UI, not a provider data warehouse.

## Package Manager Rule
- pnpm only across this repo and this product.
- Some legacy docs/scripts still show `npm`; treat that guidance as stale and use pnpm equivalents.
- Never run `npm install`; do not generate or commit `package-lock.json`.

## Persistence Model
- Durable storage lives in shared Supabase under `myassist.*` (`app_users`, `integration_tokens`, `billing_subscriptions`, `stripe_event_log`).
- Local `.myassist-memory` is fallback/local state only, not the source of truth for hosted user/billing records.

## Auth Model
- Session auth is Auth.js/NextAuth for app access; provider OAuth is separate and explicit per integration.
- Billing entitlement authority for credential users is `myassist.billing_subscriptions` (not `platform.entitlements`).
- No production auth bypasses or session bypass query params.

## External Integrations
- Gmail, Google Calendar, and Todoist are primary provider integrations.
- Stripe is optional but canonical webhook remains `POST /api/payments/webhook` when billing is enabled.
- Infisical (`/platform` + `/myassist`) is the canonical shared secret source for team/dev workflows.
- See `./docs/TROUBLESHOOTING.md` for troubleshooting external integration environments, Supabase, and OAuth.

## Testing Contract
- Run from `products/MyAssist`.
- Baseline for app changes: `pnpm web:lint`, `pnpm web:typecheck`, `pnpm web:test`.
- Include `pnpm web:test:e2e` for UI/integration-flow changes and billing-on checks when billing paths are touched.

## Change Policy
- Preserve provider-canonical boundaries and avoid mirror-table designs for provider mail/events/tasks.
- Keep edits scoped; do not revert concurrent changes you did not author.

## Standards Docs Updates
- Update `../../docs/standards/` when a rule becomes Bookiji-wide or product-standard policy.
- Update this `AGENTS.md` when MyAssist-local execution rules change.
- Update `PRODUCT_SCOPE.md` for standards status changes.
- Update `docs/architecture.md` when persistence/auth boundaries change.
- Update `docs/billing-stripe-runbook.md` for billing/webhook/entitlement contract changes.
