# MyAssist Production Smoke

Use this checklist after production environment values are corrected and a fresh deployment is live. It is a smoke-readiness audit only: do not edit Infisical or Vercel secrets while running it, and do not create fake secrets to force a pass.

Production secrets gap runbook: [`docs/MYASSIST_PRODUCTION_SECRETS_RUNBOOK.md`](./MYASSIST_PRODUCTION_SECRETS_RUNBOOK.md).

Readiness evidence index: [`docs/MYASSIST_PRODUCTION_READINESS_INDEX.md`](./MYASSIST_PRODUCTION_READINESS_INDEX.md).

## Preflight Commands

Run from `products/MyAssist`.

## Canonical Env Loading Mode

Production verification has two env-loading modes:

Direct shell mode:

```sh
pnpm --prefix apps/web run check:env:prod
```

Direct mode reads only the current process environment. It is useful for local controlled tests when the shell has intentionally been populated with known values, but it is not the canonical production readiness source.

Infisical-loaded production mode:

```sh
pnpm --prefix apps/web run check:env:prod:infisical
pnpm --prefix apps/web run readiness:prod:infisical
```

Infisical-loaded mode runs commands through `apps/web/scripts/run-with-infisical-prod.mjs`, which loads `/platform` + `/myassist` through the Infisical CLI with `--env=prod` and then runs the wrapped command without printing secret values. This is the canonical production readiness mode because Infisical is the source of truth.

Do not create fake production values to force a pass. Missing production secrets should remain visible as `BLOCKED ON ENV` until fixed in the approved secret/deployment path.

One-command readiness verdict:

```sh
pnpm --prefix apps/web run readiness:prod:infisical
```

`readiness:prod:infisical` runs the production readiness checks under the canonical Infisical-loaded production environment, prints each command with status, exit code, and a short reason, then prints a final deterministic verdict. It does not edit secrets, Infisical, Vercel, or product runtime logic.

Expanded command sequence:

```sh
pnpm --prefix apps/web run verify:infisical -- --env=prod
pnpm --prefix apps/web run check:env:prod:infisical
pnpm --prefix apps/web run lint
pnpm --prefix apps/web run typecheck
NODE_OPTIONS=--max-old-space-size=4096 pnpm --prefix apps/web exec vitest run --maxWorkers=1
```

If `PLAYWRIGHT_PROD_SMOKE_BASE_URL` or `MYASSIST_PRODUCTION_URL` is set, `readiness:prod:infisical` also runs:

```sh
pnpm --prefix apps/web run test:smoke:prod
```

If neither deployment URL variable is set, the Playwright production smoke step is reported as `SKIPPED / BLOCKED ON DEPLOYMENT URL`, and the final verdict is `BLOCKED ON DEPLOYMENT` unless an earlier check produced a stronger blocker or failure.

Expected preflight result:

- `verify:infisical -- --env=prod` confirms `/platform` + `/myassist` prod keys are present without printing values.
- `check:env:prod:infisical` reports production readiness with hosted URLs, `AI_MODE=gateway`, hosted `JOB_HUNT_DIGEST_URL`, Supabase server storage, and no local-only service URLs.
- Lint, typecheck, and single-worker Vitest complete without product-code failures.

## 2026-04-24 Production Env Status — Option B verification run

Verification run against Infisical prod (`/platform` + `/myassist`) on 2026-04-24.
Commands run from the repo root (`products/MyAssist`) against main-branch node_modules.

### Commands run and results

| Command | Exit code | Result |
| --- | ---: | --- |
| `pnpm --prefix apps/web run lint` | 0 | PASS — no ESLint warnings or errors |
| `pnpm --prefix apps/web run typecheck` | 0 | PASS — no TypeScript errors |
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm --prefix apps/web exec vitest run --maxWorkers=1` (standalone, no prod env) | 0 | PASS — 516 passed, 1 skipped (105 test files) |
| `pnpm --prefix apps/web run verify:infisical -- --env=prod` | 1 | Infisical accessible: `/platform` 8 keys + `/myassist` 18 keys loaded; 4 MISSes → exit 1 |
| `pnpm --prefix apps/web run check:env:prod:infisical` | 1 | BLOCKED ON ENV — 4 missing production values |
| `pnpm --prefix apps/web run readiness:prod:infisical` | 1 | BLOCKED ON ENV (final verdict) — see env-sensitive vitest note below |

**Note — vitest env-sensitivity finding:** When run inside `readiness:prod:infisical` (vitest inherits Infisical prod env), 16 tests fail across 6 files. The same tests pass standalone. Failures are caused by prod env overriding test assumptions: `AI_MODE=gateway` causes Ollama-mock tests to fail, prod `MYASSIST_INTEGRATIONS_ENCRYPTION_KEY` differs from what token-store tests expect, and site-origin + Todoist route tests break under prod URLs. This is a test-isolation gap, not a product-code regression. The unit tests are designed to run without production secrets. The readiness script should clear or mask sensitive env vars before running vitest, or run vitest before loading Infisical prod env. Tracking as a pre-launch fix item.

Failing test files under prod env (vitest step in `readiness:prod:infisical`):

- `lib/fetchDailyContext.test.ts` — 2 tests (`prioritizeGmailSignalsWithAi`)
- `lib/myassistSiteOrigin.test.ts` — 1 test (`buildMyAssistAuthCallbackUrlForRequest`)
- `lib/integrations/tokenStore.test.ts` — 2 tests (token store encrypt/decrypt)
- `app/api/assistant/route.test.ts` — 8 tests (Ollama + situation_brief paths)
- `app/api/todoist/tasks/[taskId]/complete/route.test.ts` — 1 test
- `app/api/todoist/tasks/[taskId]/schedule/route.test.ts` — 3 tests

### Infisical prod: values confirmed present

- `AUTH_SECRET` ✓
- `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` ✓
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` ✓
- `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` ✓
- `MYASSIST_INTEGRATIONS_ENCRYPTION_KEY` ✓
- `AI_MODE=gateway` ✓
- `VERCEL_AI_BASE_URL` / `AI_GATEWAY_BASE_URL` ✓ (hosted, not localhost)
- `AUTH_URL` + `NEXT_PUBLIC_SITE_URL` ✓ (hosted URLs)
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` ✓
- `TODOIST_CLIENT_ID` + `TODOIST_CLIENT_SECRET` ✓
- Stripe billing keys ✓
- No localhost service URLs in any configured value ✓

### Infisical prod: values still missing

These 5 values are absent from Infisical prod and must be provisioned before `readiness:prod:infisical` can return PASS:

| Variable | Infisical path | Reason |
| --- | --- | --- |
| `VERCEL_VIRTUAL_KEY` or `OPENAI_API_KEY` | `/myassist` | AI gateway key; `AI_MODE=gateway` is set but the credential is absent |
| `JOB_HUNT_DIGEST_URL` | `/myassist` | Must be a hosted HTTPS URL; no localhost fallback allowed in production |
| `MICROSOFT_CLIENT_ID` | `/myassist` | Microsoft/Outlook login; mark N/A only if provider is intentionally disabled |
| `MICROSOFT_CLIENT_SECRET` | `/myassist` | Same as above |
| `RESEND_API_KEY` | `/myassist` | Password-reset email delivery; mark N/A only if feature is intentionally disabled |
| `MYASSIST_PASSWORD_RESET_EMAIL_FROM` | `/myassist` | Verified Resend sender; same condition as `RESEND_API_KEY` |

### Next actions for Option B green

1. Provision `VERCEL_VIRTUAL_KEY` (or `OPENAI_API_KEY`) in Infisical prod `/myassist` and sync to Vercel project `my-assist` Production environment.
2. Provision `JOB_HUNT_DIGEST_URL` (hosted HTTPS URL) in Infisical prod `/myassist` and sync to Vercel.
3. Decide Microsoft OAuth: provision `MICROSOFT_CLIENT_ID` + `MICROSOFT_CLIENT_SECRET` **or** formally document the provider as disabled for this release.
4. Decide password reset: provision `RESEND_API_KEY` + `MYASSIST_PASSWORD_RESET_EMAIL_FROM` **or** formally document the feature as disabled.
5. After provisioning, redeploy on Vercel and rerun: `pnpm --prefix apps/web run readiness:prod:infisical`
6. Set `PLAYWRIGHT_PROD_SMOKE_BASE_URL=https://myassist.bookiji.com` and run: `pnpm --prefix apps/web run test:smoke:prod`

### Current go/no-go

| Area | Status |
| --- | --- |
| Overall | BLOCKED ON ENV |
| Lint | PASS |
| Typecheck | PASS |
| Vitest standalone (516 tests, no prod env) | PASS |
| Vitest under prod env (inside `readiness:prod:infisical`) | FAIL — 16 env-sensitive tests; fix test isolation before final PASS |
| Auth / Supabase | PASS (values confirmed in Infisical prod) |
| Google OAuth | PASS (values confirmed in Infisical prod) |
| Todoist OAuth | PASS (values confirmed in Infisical prod) |
| Assistant (AI gateway) | BLOCKED ON ENV — gateway key absent |
| Microsoft OAuth | BLOCKED ON OAUTH — credentials absent; decide enabled or N/A |
| Password reset email | BLOCKED ON ENV — Resend key + sender absent; decide enabled or N/A |
| JobHunt digest | BLOCKED ON ENV — `JOB_HUNT_DIGEST_URL` absent |
| No localhost URLs | PASS |
| Playwright production smoke | BLOCKED ON DEPLOYMENT — set `PLAYWRIGHT_PROD_SMOKE_BASE_URL` after provisioning |

## Go / No-Go

| Status | Meaning | Decision |
| --- | --- | --- |
| PASS | Check completed against production and matched the expected behavior. | Continue. |
| BLOCKED ON ENV | Required production env value is missing, malformed, local-only, or in the wrong Vercel project/environment. | Stop; fix Infisical/Vercel env and redeploy. |
| BLOCKED ON OAUTH | Provider app, redirect URI, consent screen, scopes, or test-user access blocks sign-in or integration connection. | Stop; fix provider console/OAuth setup and retry. |
| BLOCKED ON DEPLOYMENT | Vercel auth wall, stale deployment, wrong project/root, domain mismatch, or unreachable hosted service blocks validation. | Stop; fix deployment configuration and redeploy. |
| FAIL | App behavior is wrong after env, OAuth, and deployment are confirmed correct. | Stop; file product defect with evidence. |

## Readiness Verdicts

| Final verdict | Exit code | Meaning |
| --- | ---: | --- |
| PASS | 0 | All readiness checks passed, including Playwright production smoke when a deployment URL was provided. |
| BLOCKED ON ENV | 1 | Infisical or production env readiness found missing, malformed, local-only, or unmapped production configuration. |
| BLOCKED ON OAUTH | 1 | A check surfaced provider OAuth or callback configuration drift that must be fixed outside the app code. |
| BLOCKED ON DEPLOYMENT | 1 | Production smoke could not run because no deployment URL was provided, or the hosted deployment is blocked by deployment protection, wrong routing, or similar deployment setup. |
| FAIL | 2 | Lint, typecheck, Vitest, or production smoke found a product-code/runtime regression after blocker checks were not the primary cause. |

Expected blocker behavior:

- Missing production secrets should produce `BLOCKED ON ENV`, not `FAIL`.
- Missing `PLAYWRIGHT_PROD_SMOKE_BASE_URL` / `MYASSIST_PRODUCTION_URL` should mark the Playwright smoke step as skipped and produce `BLOCKED ON DEPLOYMENT` if all earlier checks pass.
- OAuth provider/callback drift should produce `BLOCKED ON OAUTH`.
- Product-code check failures should produce `FAIL`.
- The script is orchestration only; do not create fake env values to force `PASS`.

## Failure Classification

`readiness:prod` prints each failed or skipped step with a blocker class, short reason, and next action. The final verdict uses the strongest unresolved blocker so operators fix environment and deployment prerequisites before treating product-code checks as release defects.

| Blocker class | Meaning | Typical causes | Next action |
| --- | --- | --- | --- |
| BLOCKED ON ENV | Required production configuration is missing from the Infisical/Vercel production contract. | Missing `JOB_HUNT_DIGEST_URL`, gateway key, Supabase production value, `RESEND_API_KEY`, or `MYASSIST_PASSWORD_RESET_EMAIL_FROM` when that feature is expected. | Provision the named value in Infisical prod (`/platform` or `/myassist` as appropriate), sync the same name to the active Vercel project, redeploy when needed, and rerun readiness. |
| BLOCKED ON OAUTH | Provider OAuth setup is expected but credentials or provider-console settings are incomplete. | Missing `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`, redirect URI mismatch, consent screen, Entra tenant policy, scopes, or test-user access. | Fix the provider app credentials and callback configuration, or document the provider as intentionally disabled, then rerun readiness. |
| BLOCKED ON DEPLOYMENT | The smoke harness cannot validate the hosted app or is pointed at no deployment. | Missing `PLAYWRIGHT_PROD_SMOKE_BASE_URL` / `MYASSIST_PRODUCTION_URL`, Vercel Deployment Protection, wrong project/root, stale deployment, or unreachable hosted service. | Set the production smoke URL or fix deployment routing/protection, redeploy when needed, then rerun readiness. |
| FAIL | Product code or runtime behavior failed after prerequisite blockers were not the primary cause. | Lint/typecheck/Vitest failure, Playwright 5xx response, malformed production URL accepted by runtime, localhost leak in hosted smoke output, or unexpected script/runtime exception. | Treat as a product defect, inspect the failing command output, fix code or runtime behavior, and rerun the targeted check before rerunning readiness. |

## Production Smoke Checklist

| Check | How to verify | Expected result | Status |
| --- | --- | --- | --- |
| App loads without Vercel auth wall | Open the production URL in a private browser session. | MyAssist app or `/sign-in` loads. No Vercel Authentication login wall or Vercel 401 HTML page appears. |  |
| Supabase login works | Sign in with the primary Supabase-supported method for the smoke account. | `/auth/callback` completes, the dashboard loads, and server APIs are no longer unauthorized for the session. |  |
| Google OAuth works | From `/sign-in`, use Continue with Google when enabled. | Google returns to `/auth/callback`, session is established, and `GET /api/auth/oauth-self-check` shows production callback URLs matching Google Cloud Console. |  |
| Microsoft OAuth works if enabled | From `/sign-in`, use Continue with Outlook when Microsoft provider env is enabled. | Microsoft returns to `/auth/callback`, session is established, and callback URL matches the Entra app registration. Mark N/A if provider is intentionally disabled. |  |
| Password reset email works if enabled | From `/forgot-password`, request reset for the smoke account. | UI returns generic success, Resend sends a reset email from the configured verified sender, and the link targets the production MyAssist origin. Mark N/A if password reset email is intentionally disabled. |  |
| Today view loads Gmail live data | Connect Gmail, refresh Today, and inspect Inbox / daily context. | Integration status is connected and Today includes live Gmail signals or a clear empty-live state from Gmail, not mock/demo/cache data. |  |
| Today view loads Google Calendar live data | Connect Google Calendar, refresh Today, and inspect Calendar / daily context. | Integration status is connected and Today includes live calendar events or a clear empty-live state from Google Calendar, not mock/demo/cache data. |  |
| Today view loads Todoist live data | Connect Todoist, refresh Today, and inspect Tasks / daily context. | Integration status is connected and Today includes live Todoist tasks or a clear empty-live state from Todoist, not mock/demo/cache data. |  |
| `/api/assistant` returns gateway-backed response | While signed in, POST to `/api/assistant` with `kind:"chat"` and a small valid context, or ask from the Assistant tab and inspect the response. | Response is HTTP 200 JSON with `mode:"gateway"` and provider/model metadata from the configured gateway. |  |
| `/api/assistant` fallback returns controlled JSON | Temporarily validate using an approved non-secret test deployment or local production-like run with `AI_MODE=fallback`; do not change production secrets for this check. | Response is HTTP 200 controlled JSON with `mode:"fallback"`, stable `answer/actions/followUps/taskDraft` shape, and no 500 dead-end. |  |
| JobHunt saved jobs/digest loads from hosted `JOB_HUNT_DIGEST_URL` | Open `/job-hunt` and hit the app's job-hunt digest route from production. | Saved jobs/digest load from the hosted service URL. No dependency on local `127.0.0.1:3847` remains in production. |  |
| No localhost URLs appear in production runtime/readiness output | Review `check:env:prod:infisical`, runtime logs, OAuth self-check routes, and any readiness output. | No `localhost`, `127.0.0.1`, `::1`, or laptop-only service URL appears for production `AUTH_URL`, `NEXT_PUBLIC_SITE_URL`, gateway, OAuth redirect, or `JOB_HUNT_DIGEST_URL`. |  |

## Evidence To Capture

- Production deployment URL and Vercel project name.
- Exact preflight command outputs with exit codes; redact secret values if any tool unexpectedly prints them.
- Screenshot or trace for app load, login, OAuth callback, Today live data, and JobHunt.
- `/api/assistant` response metadata: status, `mode`, provider/model fields, and fallback shape where applicable.
- Provider OAuth self-check URLs used for Google and Microsoft callback comparison.

## Stop Conditions

- Stop at `BLOCKED ON ENV` if prod Infisical/Vercel values are absent, local-only, or not mirrored into the active Vercel project.
- Stop at `BLOCKED ON OAUTH` if a provider rejects redirect URI, scopes, consent, tenant policy, or test-user access.
- Stop at `BLOCKED ON DEPLOYMENT` if Vercel Deployment Protection blocks anonymous app load, the wrong project is serving the domain, or hosted `JOB_HUNT_DIGEST_URL` is unreachable.
- Use `FAIL` only after env, OAuth, and deployment blockers are ruled out.
