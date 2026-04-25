# Pre-demo smoke (operator checklist)

Run from repo root (`products/MyAssist`):

0. **Infisical (team / demo with shared secrets — recommended)**  
   - Full runbook: [infisical-and-secrets.md](./infisical-and-secrets.md).  
   - `infisical init` once in `apps/web` if you have not (creates `apps/web/.infisical.json`, gitignored).  
   - In Infisical, ensure **`/platform`** and **`/myassist`** (e.g. env `dev`) include **`NEXT_PUBLIC_SITE_URL`**, **`AUTH_URL`**, Supabase keys, **`AUTH_SECRET`**, and OAuth/encryption keys as in `apps/web/README.md` (“Infisical-first minimum local set”).  
   - Start the app with **`pnpm dev:infisical`** (web only) or **`pnpm dev:all`** (Next + job-hunt). This merges Infisical into the process; `apps/web/.env.local` still applies as a local override.  
   - Optional check without starting Next: `pnpm verify:infisical` (from `apps/web` or root per `package.json`).

1. **Gates (must be green before you present)**  
   `pnpm web:lint` → `pnpm --filter web run typecheck` → `pnpm --filter web run test` → `pnpm run vercel-build`

2. **Env sanity**  
   `pnpm --prefix apps/web run check:env` (and `check:env:prod` for production-like checks). Fix any **required** items for the path you are showing (e.g. Supabase + `AUTH_URL` for real login; integration OAuth for live Gmail/Todoist).

3. **Demo without live provider tokens**  
   One command from repo root: **`pnpm demo`** (sets `MYASSIST_DEMO_MODE=true`; see `apps/web/scripts/start-demo.mjs`). With Infisical first: **`pnpm demo:infisical`**.  
   Alternatively set **`MYASSIST_USE_MOCK_CONTEXT=true`** (and optionally **`MYASSIST_DEMO_MODE=true`**) in `.env.local`; see `apps/web/.env.example` and [commercial-pilot-readiness.md](./commercial-pilot-readiness.md).

4. **E2E (optional, longer)**  
   `pnpm --filter web run test:e2e -- --reporter=line` — expect Playwright to start **Next on 127.0.0.1:3005** first (can take a minute on cold boot). See `apps/web/README.md` Playwright section.

5. **Auth callback**  
   Supabase redirect URLs must include `{origin}/auth/callback`. If users land on **sign-in with an error=** query, see [auth-supabase-callback.md](./auth-supabase-callback.md) and `SignInForm` error copy in code.

Related: [thorough-testing-report.md](./thorough-testing-report.md), [qa-manual-checklist.md](./qa-manual-checklist.md).
