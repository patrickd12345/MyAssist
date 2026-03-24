# MyAssist Project Tracker

Live execution tracker for the local-first build, with commercial-safe foundations.

## Now

- [ ] Restore live Ollama connectivity so `/api/assistant` can answer in `ollama` mode instead of fallback mode.
- [ ] Verify the protected Vercel deployment manually in-browser while local proxy and ngrok are running.
- [ ] Rotate any secret that was exposed during setup and update the affected local or cloud config.
- [ ] Keep the local workflow and assistant interfaces migration-safe for a future hosted cutover.

## Next

- [ ] Improve local setup reliability and runbook quality.
- [ ] Tighten the assistant voice, action proposals, and conversational depth.
- [ ] Harden webhook and secret handling without adding multi-tenant complexity.
- [ ] Keep interfaces stable so auth, billing, and BYOK can be added later without rewrites.

## Blocked

- [ ] n8n MCP in this workspace does not expose workflow editing tools, so webhook-node creation must be done in n8n UI.

## Done

- [x] Built `apps/web` read-only dashboard and JSON copy flow.
- [x] Added dev mock fallback when webhook URL is missing.
- [x] Validated app lint/type checks after fallback changes.
- [x] Confirmed via MCP that the live workflow currently has Cron trigger only.
- [x] Locked hosting strategy: local orchestration for development, hosted orchestration for pilot/commercial use.
- [x] Documented baseline infra cost bands for pilot and early commercial rollout.
- [x] Confirmed product strategy: commercial-safe foundations now, local-first implementation first.
- [x] Verified repo source of truth already includes `Webhook - Fetch Daily Context` and variable-based Todoist auth.
- [x] Added a travel/demo operating mode and tunnel runbook for Vercel -> local n8n testing.
- [x] Fixed local n8n credentials and restored live normalized JSON end to end.
- [x] Cleared stale local web ports and normalized root commands around `npm`.
- [x] Implemented a local webhook-only proxy and authenticated ngrok tunnel for travel/demo mode.
- [x] Linked `apps/web` to Vercel and deployed production with tunnel env vars.
- [x] Added Docker Compose-based local n8n runtime with persistent data and restart policy.
- [x] Reframed `apps/web` into an operator-style assistant UI instead of a raw list.
- [x] Added `/api/assistant` with local Ollama support and deterministic fallback mode.
- [x] Added an interactive assistant console with questions, suggested actions, and follow-up prompts.
- [x] Added explicit Todoist task completion from the dashboard with optimistic UI and rollback on failure.
- [x] Added press-and-hold defer actions on task completion buttons for afternoon, tomorrow, and next week.
- [x] Added AI-drafted Todoist task creation with explicit confirmation in the assistant console.

## Risks

- Embedded secrets in workflow nodes can leak through exports/logs/screenshots.
- Local Ollama may be running in the desktop app but still unreachable from the web app process.
- Premature auth, billing, or BYOK work would slow the local product without helping current validation.
- Self-hosted orchestration on a personal machine is operationally fragile for paid usage.

## Definition of ready for commercial pilot

- Webhook + Cron both active and tested.
- Secrets managed only by credential manager or secure vars.
- Deterministic API contract between n8n and app.
- Auth boundaries in place for tenant-scoped data access.
- Error monitoring and retry behavior verified on critical paths.

## Hosting and cost guardrails

- Development default:
  - `apps/web` can run locally or on Vercel.
  - n8n can run on the local PC while workflows and contracts are still changing.
- Travel/demo mode:
  - Vercel can call local n8n through a tunnel when the machine is online.
  - Expose only the webhook path, never the n8n admin UI.
  - Treat the tunnel as temporary access for testing, not as production infrastructure.
- Pilot/commercial default:
  - `apps/web` on Vercel.
  - Orchestration on hosted n8n or equivalent worker platform, not a personal computer.
  - Supabase for auth, state, quota tracking, and audit logs.
- Estimated monthly baseline:
  - Leanest commercial stack: about `$25-35/month` using `Vercel Pro` + `Supabase Free` + low-usage Railway-hosted n8n.
  - Lower-ops commercial stack: about `$40-50/month` using `Vercel Pro` + `Supabase Free` + `n8n Cloud Starter`.
- Product-mode implication:
  - `BYOK required` + low orchestration quota keeps AI inference cost off the platform and leaves infra/orchestration as the main fixed cost.
- Migration rule:
  - Keep `n8n/myassist_unified.json` as source of truth.
  - Keep webhook contract stable.
  - Keep all tokens in credentials/env vars only so local-to-hosted cutover is import/reconfigure, not redesign.

## Current scope rule

- Build the local single-user version first.
- Do not implement tenant auth, billing, quotas, or BYOK flows yet.
- Do preserve boundaries so those can be added later without redoing the app or workflow core.
