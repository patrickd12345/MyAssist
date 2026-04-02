# MyAssist thorough testing report

**Date:** 2026-04-01  
**Environment:** Windows 10, Node v22.14.0, branch `main`, commit `fb66083de093df3cd875857cd142beab41450936`  
**App root:** `apps/web`

## Exploratory crawl (desktop + mobile)

The full Playwright suite acts as a **scripted crawl** of primary surfaces (not a manual browser tour). Evidence from the latest run:

| Observation | Notes |
| ----------- | ----- |
| Desktop navigation | `dashboard-sanity`, `demo-walkthrough`, `job-hunt`, `assistant-ask` exercise `/` tabs and `/job-hunt` |
| Mobile viewport | `mobile-task-touch-targets.spec.ts` uses **Pixel 5** (`devices["Pixel 5"]`) for Tasks tab layout |
| Timings | Per-test durations in Playwright output (e.g. assistant ~9 s, dashboard sanity ~3.7 s, demo ~21.5 s); total wall ~87 s |
| Network | `assistant-ask` waits for **`POST /api/assistant`** (200); `dashboard-sanity` hits **`GET /api/integrations/status`** and **`GET /api/daily-context`** |
| Screenshots | No screenshot artifacts committed in this run; Playwright **`trace: on-first-retry`** in CI for failures |

## Methodology (challenge-ready)

Verification uses **layers**; no layer alone proves every branch with live OAuth, AI, and external APIs.

| Layer | What ran | Role |
| ----- | -------- | ---- |
| 1 | ESLint, TypeScript `tsc --noEmit`, Vitest | Fast regression net |
| 2 | Playwright (`tests/e2e`, mock daily context) | Scripted browser flows |
| 3 | Exploratory notes | Same session: full E2E suite drives real navigation, API calls, Assistant POST, mobile viewport |

Prepared tests are **necessary but not sufficient** for a claim of exhaustive coverage. This report states **what was executed**, **exit status**, and **known gaps**.

## Environment flags (E2E)

Playwright starts `next dev` on `http://127.0.0.1:3005` with (see `apps/web/playwright.config.ts`):

- `MYASSIST_USE_MOCK_CONTEXT=true` — mock Gmail/Calendar/Todoist payload (not production tokens)
- `AUTH_SECRET`, `AUTH_URL`, `MYASSIST_USER_STORE_FILE` for isolated registration

Local Vitest on this machine required a larger heap to avoid OOM:

```text
NODE_OPTIONS=--max-old-space-size=8192 pnpm test
```

## Command bundle (reproducibility)

Run from `apps/web` unless noted.

### ESLint

```text
> web@0.1.0 lint
> next lint

✔ No ESLint warnings or errors
```

**Exit code:** 0. **Approx. duration:** ~8 s.

### TypeScript

```text
> web@0.1.0 typecheck
> tsc --noEmit
```

**Exit code:** 0. **Approx. duration:** ~9 s.

### Vitest

```text
> web@0.1.0 test
> vitest run

 Test Files  71 passed | 1 skipped (72)
      Tests  357 passed | 1 skipped (358)
   Duration  39.09s (transform 32.50s, setup 77.00s, import 35.64s, tests 59.04s, environment 337.12s)
```

**Exit code:** 0 (with `NODE_OPTIONS=--max-old-space-size=8192`). **Approx. duration:** ~45 s wall time.

### Playwright (full suite)

```text
Running 9 tests using 1 worker

  ok 1 [chromium] assistant-ask.spec.ts ... (9.0s)
  ok 2 [chromium] auth-signin.spec.ts ... (2.6s)
  ok 3 [chromium] dashboard-sanity.spec.ts ... (3.7s)
  ok 4 [chromium] job-hunt.spec.ts ... (3.4s)
  ok 5 [chromium] reset-password.spec.ts ... (11.7s)
  ok 6 [chromium] reset-password.spec.ts ... (1.4s)
  ok 7 [chromium] smoke.spec.ts ... (574ms)
  ok 8 [chromium] demo-walkthrough.spec.ts ... (21.5s)
  ok 9 [chromium] mobile-task-touch-targets.spec.ts ... (2.9s)

  9 passed (1.4m)
```

**Exit code:** 0. **Approx. duration:** ~87 s (wall), **1 worker** by design.

**Observed server log (non-fatal):** `cross_system_action_failed` / `email_to_task` / `gmail_not_connected` during demo walkthrough; Fast Refresh full reload warnings. Treated as **expected** under mock/disconnected Gmail flows, not suite failures.

### Production build

```text
> pnpm clean && pnpm build

✓ Compiled successfully
✓ Generating static pages (9/9)
```

**Exit code:** 0. **Approx. duration:** ~36 s.

## Master matrix (routes x viewport x outcome)

| Area | Route / surface | Viewport | Auth | Result | Evidence |
| ---- | ----------------- | -------- | ---- | ------ | -------- |
| Auth | `/sign-in` register + sign-in | Desktop 1280 | New user | Pass | `auth-signin.spec.ts`, `dashboard-sanity` registration steps |
| Auth | `/forgot-password`, `/reset-password` | Desktop | Flow | Pass | `reset-password.spec.ts` |
| Today | `/` tabs Overview, Tasks, Inbox, Calendar, Assistant | Desktop | Signed-in | Pass | `dashboard-sanity.spec.ts` |
| APIs | `GET /api/integrations/status`, `GET /api/daily-context` | n/a | Signed-in | Pass | `dashboard-sanity.spec.ts` |
| Assistant | `POST /api/assistant` via **Ask** button | Desktop | Signed-in | Pass | `assistant-ask.spec.ts` (200 + visible question + `>=2` assistant bubbles or alert) |
| Job Hunt | `/job-hunt` | Desktop | Signed-in | Pass | `job-hunt.spec.ts` |
| Demo | Full demo walkthrough | Desktop | Signed-in | Pass | `demo-walkthrough.spec.ts` |
| Smoke | `/sign-in` shell | Desktop | Anonymous | Pass | `smoke.spec.ts` |
| Mobile | Tasks tab: **Complete** touch target | Pixel 5 (393x851) | Signed-in | Pass | `mobile-task-touch-targets.spec.ts` (height >= 44px) |
| Billing | `GET /api/billing/status` + subscription buttons vs env | Desktop | Signed-in | Pass | `billing-status.spec.ts` (default: billing off; optional `pnpm run test:e2e:billing-ui` / `PLAYWRIGHT_BILLING_UI=1` for panel visible) |
| Build | `next build` | n/a | n/a | Pass | Clean build output above |

**Routes present in `/` app build (not every path hit by a dedicated E2E spec):** see `next build` route table in the command bundle output (`/api/*` job-hunt, integrations, todoist, gmail, etc.). Automated coverage is **spotty** for many API routes; Vitest and route tests cover subsets.

## Issues fixed before this report (prior work)

| Issue | Mitigation |
| ----- | ---------- |
| Long refresh / provider hang | Server `withTimeout` on Gmail/Calendar/Todoist; AI `withTimeout` on briefing paths; client `AbortSignal.timeout` on daily-context fetch |
| Light theme contrast | Theme tokens in briefing / intelligence panels |
| Mobile task controls | `min-h-11` on task actions; E2E asserts height >= 44px |
| Stale `.next` chunk errors | `pnpm clean` + rebuild |
| Webpack warnings (Sentry/OTEL) | `ignoreWarnings` in `next.config.ts` |
| Windows Vitest flake on concurrent `createUser` | `userStoreFile.ts` lock: retry on `EPERM` / `EACCES` like `EEXIST` |

## Residual risks (not fully proven here)

| Risk | Why it remains | Mitigation |
| ---- | ---------------- | ---------- |
| Live Gmail / Calendar / Todoist OAuth | E2E uses `MYASSIST_USE_MOCK_CONTEXT`; no real OAuth consent in CI | Manual smoke with real accounts; optional staging tenant |
| Ollama / gateway AI latency and content | Assistant returns 200 with `fallback` when model unreachable; timing varies | Monitor `mode` in responses; hosted env checks |
| Hosted-only Vercel (file memory, `/tmp`, Deployment Protection) | Not exercised in this local run | Follow `apps/web/README.md` Production section; `pnpm test:hosted-smoke` when env allows |
| Parallel E2E users | `workers: 1` avoids race; not a production load test | Load testing is out of scope |
| Vitest OOM on default heap | Observed on Windows without larger heap | Document `NODE_OPTIONS` for local/CI |

## Re-run recipe

From `apps/web`:

```powershell
pnpm lint
pnpm typecheck
$env:NODE_OPTIONS="--max-old-space-size=8192"
pnpm test
pnpm exec playwright test
pnpm clean
pnpm build
```

Optional billing-on E2E only (starts Next with `BILLING_ENABLED=true` for `billing-status.spec.ts`; stop any process on the Playwright port first):

```powershell
pnpm run test:e2e:billing-ui
```

Optional hosted smoke (requires env):

```powershell
pnpm test:hosted-smoke
```

## Related docs

- [qa-manual-checklist.md](./qa-manual-checklist.md) — matrix checklist for manual passes  
- [apps/web/README.md](../apps/web/README.md) — Playwright notes, timeouts, production  
