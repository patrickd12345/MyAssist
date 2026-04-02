# MyAssist Project Tracker

Live execution tracker for the unified live operational window model.

## Now

- [ ] Restore live Ollama connectivity **on the machine that runs Next** so local `/api/assistant` can answer in `ollama` mode; for **hosted** Vercel, set `AI_MODE=gateway` (or a reachable `OLLAMA_BASE_URL`) — see [`docs/commercial-pilot-readiness.md`](docs/commercial-pilot-readiness.md) **AI inference**. **Sign-off:** [`docs/myassist-operational-signoff.md`](docs/myassist-operational-signoff.md) section 1.
- [ ] Verify live Gmail/Calendar/Todoist reads in Today view: primary UX is **refresh after OAuth return and after actions** (no background polling in MVP); confirm in browser after real OAuth connect. **Sign-off:** [`docs/myassist-operational-signoff.md`](docs/myassist-operational-signoff.md) section 2.
- [x] Rotate any secret that was exposed during setup and update the affected local or cloud config.
- [ ] Keep provider adapter and service interfaces stable for hosted rollout. **Sign-off:** [`docs/myassist-operational-signoff.md`](docs/myassist-operational-signoff.md) section 3.
- [x] **Hosted readiness (Path A):** Supabase migration + dual-mode `userStore` / `tokenStore` when `SUPABASE_*` is set; Sentry hooks; [`docs/commercial-pilot-readiness.md`](docs/commercial-pilot-readiness.md) checklist and runbook.
- [x] **MVP closure docs:** AI hosted vs local, runbook steps for context header + assistant `mode`, `.env.example` AI block, Vitest gateway chat path, E2E OAuth return banner step.

## Next

- [x] **Environment hardening / dev-prod separation (first pass):** `sharedDbEnv` + `bootstrap.sharedDb` on Node boot, `assertMyAssistRuntimeEnv` for prod/strict Supabase, `pnpm dev:infisical` merge script (also **`pnpm dev:infisical`** at repo root), OAuth integration route tests, `SHARED_DB_*` ref vars in `.env.example`. **Infisical** is the documented team default for secrets (`AUTH_SECRET`, Supabase, OAuth); README + root README point to it.
- [x] **`pnpm dev:all` single entry:** `scripts/dev-all.mjs` runs Next + job-hunt digest with shared `scripts/infisical-merge.mjs` (optional Infisical, graceful fallback); `apps/web/scripts/dev-with-infisical.mjs` uses the same merge helper.
- [x] **Env sign-off §0:** [`docs/myassist-operational-signoff.md`](docs/myassist-operational-signoff.md) section 0 documents `pnpm check:env` / `pnpm check:env:prod` (no secret values); billing-related checks apply when `BILLING_ENABLED=true` (see [`apps/web/lib/env/envReadiness.ts`](apps/web/lib/env/envReadiness.ts)).
- [ ] Tighten the assistant voice, action proposals, and conversational depth.
- [ ] Finalize adapter/service boundaries: `gmailAdapter`, `calendarAdapter`, `todoistAdapter`, `unifiedTodayService`, `crossSystemActionService`.
- [ ] Harden OAuth and secret handling without adding multi-tenant complexity.
- [ ] Keep interfaces stable for future multi-tenant auth and BYOK without rewrites (Stripe billing is optional and already wired; see [`PRODUCT_SCOPE.md`](PRODUCT_SCOPE.md)).

## Blocked

- [ ] None.

## Done

- [x] **Shared DB env guardrails:** Boot-time `runMyAssistSharedDbBootstrap` in `instrumentation.ts`; tier/URL validation in `lib/env/sharedDbEnv.ts` with Vitest coverage; production requires Supabase URL + server key when `NODE_ENV=production` or `SHARED_DB_ENV_STRICT=1` (`assertMyAssistRuntimeEnv` in `runtime.ts`).
- [x] **MVP commercial-pilot closure checkpoint (2026-03-31):** Git tag `myassist-mvp-closure-2026-03-31` on `main` — docs (`commercial-pilot-readiness` AI paths, Today scope), `.env.example` AI block, gateway Vitest, OAuth E2E step; Monday QA_Proof item created.
- [x] **Vercel preview / OAuth:** Cleared project **Vercel Authentication** (`ssoProtection`) on `my-assist` via REST API so `*.vercel.app` URLs are reachable without the platform SSO wall; smoke-tested `GET /sign-in` → **200** on latest Production deployment.
- [x] Built `apps/web` unified Today dashboard and JSON copy flow.
- [x] Provider-canonical daily context: live Gmail, Calendar, and Todoist reads; source model `live` | `mock` | `cache`; optional mock via `MYASSIST_USE_MOCK_CONTEXT`.
- [x] Removed active n8n webhook/bootstrap from runtime; n8n workflow exports preserved as **dormant** (see `docs/n8n-dormant.md`).
- [x] Validated app lint/type checks after integration alignment.
- [x] Documented baseline infra cost bands for pilot and early commercial rollout.
- [x] Confirmed product strategy: commercial-safe foundations now, local-first implementation first.
- [x] Implemented app-owned OAuth integrations for Gmail, Calendar, and Todoist.
- [x] Fixed provider read/write paths to use direct provider APIs.
- [x] Cleared stale local web ports and normalized root commands around `npm`.
- [x] Linked `apps/web` to Vercel and deployed production with tunnel env vars.
- [x] Reframed `apps/web` into an operator-style assistant UI instead of a raw list.
- [x] Added `/api/assistant` with local Ollama support and deterministic fallback mode.
- [x] Added an interactive assistant console with questions, suggested actions, and follow-up prompts.
- [x] Added explicit Todoist task completion from the dashboard with optimistic UI and rollback on failure.
- [x] Added press-and-hold defer actions on task completion buttons for afternoon, tomorrow, and next week.
- [x] Added AI-drafted Todoist task creation with explicit confirmation in the assistant console.
- [x] **Stripe billing (Bookiji-style):** Checkout, Customer Portal, `POST /api/payments/webhook`, `myassist` subscription tables, production guards, dashboard **Subscription** panel + `GET /api/billing/status`; runbook [`docs/billing-stripe-runbook.md`](docs/billing-stripe-runbook.md).
- [x] **E2E billing:** `tests/e2e/billing-status.spec.ts` (default off; optional `pnpm run test:e2e:billing-ui`); **Windows** file user-store lock retries `EPERM`/`EACCES` in [`userStoreFile.ts`](apps/web/lib/userStoreFile.ts) for stable concurrent registration tests.

## Risks

- Local Ollama may be running in the desktop app but still unreachable from the web app process.
- Premature multi-tenant marketplace features or heavy BYOK scope would slow single-user validation.
- Any drift toward local provider mirror tables would increase complexity and reliability risk.

## Definition of ready for commercial pilot

- Live provider adapters active and tested.
- Secrets managed only by credential manager or secure vars.
- Deterministic API contracts between adapters/services and UI.
- Auth boundaries in place for tenant-scoped data access.
- Error monitoring and retry behavior verified on critical paths.

## Hosting and cost guardrails

- Development default:
  - `apps/web` can run locally or on Vercel.
- Travel/demo mode:
  - Vercel can run directly against provider OAuth integrations.
- Pilot/commercial default:
  - `apps/web` on Vercel.
  - Provider adapters and service layer hosted with the app runtime.
  - Supabase for auth, state, quota tracking, and audit logs.
- Estimated monthly baseline:
  - Leanest commercial stack: about `$20-30/month` using `Vercel Pro` + `Supabase Free`.
  - Higher-ops stack grows with provider API usage, not with sync infrastructure.
- Product-mode implication:
  - `BYOK required` keeps AI inference cost off-platform; fixed cost remains app hosting and auth/state.
- Migration rule:
  - Keep provider APIs canonical.
  - Keep adapter/service contracts stable.
  - Keep all tokens in credentials/env vars only.

## Current scope rule

- Ship the single-user / single-tenant MyAssist surface first (credential auth, no marketplace).
- **Optional Stripe subscription** is in scope when `BILLING_ENABLED=true` (see [`PRODUCT_SCOPE.md`](PRODUCT_SCOPE.md), [`docs/billing-stripe-runbook.md`](docs/billing-stripe-runbook.md)); multi-vendor marketplace and `platform.entitlements` as authority for credential users remain out of scope.
- Preserve adapter and service boundaries so stricter auth, quotas, or BYOK can land later without rewriting the live window.
