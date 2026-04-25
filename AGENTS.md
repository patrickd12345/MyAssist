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
- Primary session auth is **Supabase Auth** (magic link, email/password, Google, Microsoft/Azure OAuth); `/auth/callback` exchanges the auth code and runs **`ensureAppUser`** to bridge `auth.users` → `myassist.app_users` (no hidden writes in session helpers).
- Legacy Auth.js env vars (`AUTH_SECRET`, etc.) may still exist for tooling; hosted login flows use Supabase + `/auth/callback`.
- Provider OAuth for Gmail/Calendar/Todoist remains separate integration OAuth under `/api/integrations/*`.
- Billing entitlement authority for credential users is `myassist.billing_subscriptions` (not `platform.entitlements`).
- No production auth bypasses or session bypass query params.

## External Integrations
- Gmail, Google Calendar, and Todoist are primary provider integrations.
- Stripe is optional but canonical webhook remains `POST /api/payments/webhook` when billing is enabled.
- Infisical (`/platform` + `/myassist`) is the canonical shared secret source for team/dev workflows; use **`pnpm dev:infisical`** (or root **`pnpm dev:all`**) for shared env, not `pnpm dev` alone, unless you rely only on `apps/web/.env.local`. For a **curated Today demo** (no live provider reads), use **`pnpm demo`** or **`pnpm demo:infisical`**. Store **`NEXT_PUBLIC_SITE_URL`** in `/myassist` for correct OAuth / magic link redirects. For **AI assistants and secret CRUD**, see [Infisical for agents](#infisical-for-agents) below (official **MCP** + **CLI**).
- **Troubleshooting (auth, env, OAuth, Supabase, sessions):** [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md).

### Infisical for agents

**Full runbook (paths, MCP, CLI, `.env.local` sync, Vercel):** [docs/infisical-and-secrets.md](./docs/infisical-and-secrets.md).

Infisical documents **first-class support for AI agents**, including a **Model Context Protocol** server so assistants can list/create/update secrets without ad-hoc sharing. This MyAssist repo does **not** check in a Cursor `mcp.json` for Infisical; each machine enables it by following Infisical’s own setup.

- **Official Infisical MCP (preferred for tool-capable agents):** install/configure [`@infisical/mcp`](https://www.npmjs.com/package/@infisical/mcp) (`npx -y @infisical/mcp`). Authenticate with a **Machine Identity** via **Universal Auth** (`INFISICAL_UNIVERSAL_AUTH_CLIENT_ID` + `INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET`) or an access token (`INFISICAL_TOKEN` with `INFISICAL_AUTH_METHOD=access-token`). See the package README, the server repo [Infisical/infisical-mcp-server](https://github.com/Infisical/infisical-mcp-server), and Infisical’s docs on identities and [Agent Sentinel](https://infisical.com/docs/documentation/platform/agent-sentinel/overview) (governance for MCP and agents). This repo does not duplicate that documentation.
- **Infisical CLI (terminal and `pnpm dev:infisical`):** on the developer machine, after `infisical login` (or non-interactive identity), use the CLI. **Working directory:** `apps/web` (`.infisical.json` and workspace binding). **Path for this product:** `--path=/myassist` (and `/platform` when shared platform secrets apply).
- **Example (dev, CLI):** `infisical secrets set KEY=value --path=/myassist --env=dev` — use `staging` / `prod` when appropriate; do **not** guess production URLs or paste secret values into chat or commits.
- **Bulk from `apps/web/.env.local` → Infisical (keys and values, `dev`):** `node scripts/sync-env-to-infisical-once.mjs` (from `apps/web`) adds any **missing** key names. **`node scripts/sync-env-to-infisical-once.mjs --all`** re-pushes every **non-empty** value in `.env.local`, overwriting the same name in Infisical (keeps the vault aligned with a trusted local file). **Empty values** are skipped (e.g. placeholder `AUTH_SECRET=`), because `infisical secrets set --file .env.local` rejects a file with empty values. **Never** commit real `.env.local` contents; use the script only on a machine with a legit local file, then run `pnpm dev:infisical` to consume secrets.
- **Local dev** often uses `http://localhost:3000` for `NEXT_PUBLIC_SITE_URL` and `AUTH_URL` in `dev` so OAuth redirects match. **Production** must use the real public site URL.
- A short reminder also lives in the maintainer’s **user-level** Cursor rule `memory-bookiji-infisical-cli.mdc`. **Workstream policy** stays here; **operational steps and links** are expanded in [docs/infisical-and-secrets.md](./docs/infisical-and-secrets.md).

## Testing Contract
- Run from `products/MyAssist`.
- Baseline for app changes: `pnpm web:lint`, `pnpm web:typecheck`, `pnpm web:test`, and `pnpm run vercel-build` before a release or demo.
- Pre-demo operator checklist: [`docs/pre-demo-smoke.md`](./docs/pre-demo-smoke.md).
- Include `pnpm web:test:e2e` for UI/integration-flow changes and billing-on checks when billing paths are touched.

## Change Policy
- Preserve provider-canonical boundaries and avoid mirror-table designs for provider mail/events/tasks.
- Keep edits scoped; do not revert concurrent changes you did not author.

## Standards Docs Updates

- **Keep documentation current with the repo:** whenever behavior, env, scripts, auth, integrations, or runbooks change, update the same PR (or a follow-up immediately after) so `AGENTS.md`, `docs/*`, and `apps/web/README.md` do not drift from the code. Stale docs are treated as bugs for this workstream.
- Update `../../docs/standards/` when a rule becomes Bookiji-wide or product-standard policy.
- Update this `AGENTS.md` when MyAssist-local execution rules change (including Infisical, `scripts/sync-env-to-infisical-once.mjs`, and `apps/web/README` env runbooks).
- Update `PRODUCT_SCOPE.md` for standards status changes.
- Update `docs/architecture.md` and `docs/auth-supabase-callback.md` when persistence/auth/callback behavior changes.
- Update `docs/infisical-and-secrets.md` when Infisical paths, sync script, MCP, or `dev:infisical` / merge behavior changes; keep `TROUBLESHOOTING.md` and `apps/web/README.md` cross-links in sync.
- Update `docs/billing-stripe-runbook.md` for billing/webhook/entitlement contract changes.
