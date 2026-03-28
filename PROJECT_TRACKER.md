# MyAssist Project Tracker

Live execution tracker for the unified live operational window model.

## Now

- [ ] Restore live Ollama connectivity so `/api/assistant` can answer in `ollama` mode instead of fallback mode.
- [ ] Verify live Gmail/Calendar/Todoist reads in Today view without manual refresh as primary UX.
- [x] Rotate any secret that was exposed during setup and update the affected local or cloud config.
- [ ] Keep provider adapter and service interfaces stable for hosted rollout.
- [x] **Hosted readiness (Path A):** Supabase migration + dual-mode `userStore` / `tokenStore` when `SUPABASE_*` is set; Sentry hooks; [`docs/commercial-pilot-readiness.md`](docs/commercial-pilot-readiness.md) checklist and runbook.

## Next

- [ ] Improve local setup reliability and runbook quality.
- [ ] Tighten the assistant voice, action proposals, and conversational depth.
- [ ] Finalize adapter/service boundaries: `gmailAdapter`, `calendarAdapter`, `todoistAdapter`, `unifiedTodayService`, `crossSystemActionService`.
- [ ] Harden OAuth and secret handling without adding multi-tenant complexity.
- [ ] Keep interfaces stable so auth, billing, and BYOK can be added later without rewrites.

## Blocked

- [ ] None.

## Done

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

## Risks

- Local Ollama may be running in the desktop app but still unreachable from the web app process.
- Premature auth, billing, or BYOK work would slow the local product without helping current validation.
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

- Build the local single-user version first.
- Do not implement tenant auth, billing, quotas, or BYOK flows yet.
- Do preserve boundaries so those can be added later without redoing the app or workflow core.
