# MyAssist troubleshooting directive

Use this as the **single runbook** for auth, env, Google/Microsoft OAuth, Supabase, sessions, and local/CI operations. It consolidates known failure modes and fixes gathered from development and production debugging.

**Related deep-dives:** [auth-supabase-callback.md](./auth-supabase-callback.md) (callback flow, error codes, session cookies) · [pre-demo-smoke.md](./pre-demo-smoke.md) · [commercial-pilot-readiness.md](./commercial-pilot-readiness.md) · `apps/web/README.md` (Playwright, Infisical)

---

## Quick symptom → action

| Symptom | Most likely cause | What to do |
|--------|-------------------|------------|
| After **Google (or Microsoft) OAuth**, user lands on **bookiji.com** (or another Bookiji app), not **MyAssist** | Browser `redirectTo` used **`window.location.origin`** because **`NEXT_PUBLIC_SITE_URL`** was unset on the **MyAssist** deployment, and the user started sign-in from a **non–MyAssist** host; or Vercel/Supabase URL config points at the wrong product | On the **MyAssist** Vercel project (and Infisical `/myassist` if used): set **`NEXT_PUBLIC_SITE_URL`** to the **https** URL of your MyAssist site (e.g. `https://myassist.bookiji.com`). In **Supabase → Authentication → URL configuration**: set **Site URL** to that host; add **`/auth/callback`** on that host to **Redirect URLs**. Run `pnpm --prefix apps/web run check:env:prod` — production-like checks require `NEXT_PUBLIC_SITE_URL`. |
| **Sign-in** page shows an **`error=`** query (e.g. `exchange_failed`, `account_link`) | Callback failed at exchange, bridge, or conflict; see error code | Match `error` to [auth-supabase-callback.md](./auth-supabase-callback.md#error-query-params-redirect-to-sign-in). User copy lives in `app/sign-in/SignInForm.tsx` (`AUTH_ERROR_COPY`). |
| **Terminal:** `AuthApiError` / **`refresh_token_not_found`** on **`GET /`** (sometimes **twice** in dev) | Stale or cross-project **Supabase session cookies**; dev **React Strict Mode** can double the server work | **Expected** when cookies are invalid. App **signs out** on that error in `getSupabaseServerUser` to clear bad state. User can clear **site cookies** for `localhost` or the deployment host. Two lines in dev is often **Strict Mode**, not two separate users. |
| **Browser console:** `feature_collector.js` / “deprecated parameters” | Not from this repository | Usually a **browser extension**. Disable extensions or use a private window to confirm. |
| **`pnpm` / E2E “looks stuck”** with no output for ~1–2 min | **Playwright** is waiting for **`next dev`** on **127.0.0.1:3005** (or boot is cold) | Normal. Use **`--reporter=line`** for progress, or `pnpm test:e2e:verbose` from `apps/web` (see `package.json` and `apps/web/README.md`). This repo’s Playwright `webServer` stdio is **`pipe`/`ignore`**-only in types — do not rely on `inherit` for TTY. |
| **`tsc` / `playwright.config`:** `stdout` / **`inherit`** not assignable | Playwright’s typings only allow `ignore` | Remove `inherit`; use default stdio or supported values only. |
| **Vercel:** integrations show disconnected after OAuth, or data not in DB | **Supabase** server keys missing on the deployment; serverless has **no durable file** user store | Set **`SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL`**, **`SUPABASE_SECRET_KEY`**, and (browser) **anon/publishable** key. See `apps/web/README.md` and `.env.example`. |
| **Wrong env / secrets in team** | Scattered `.env` vs team store | **Infisical** paths **`/platform`** and **`/myassist`**; run **`pnpm dev:infisical`** from `apps/web` or repo root. `apps/web/.env.local` is a **local fallback** only. |
| **`n8n` / `MYASSIST_N8N_*` in `.env` but nothing happens** | Next app does **not** read those vars for the dashboard | Optional **tooling** only. See [n8n-dormant.md](./n8n-dormant.md) and [n8n-myassist-troubleshooting.md](./n8n-myassist-troubleshooting.md). `tools/webhook-proxy.mjs` uses **`MYASSIST_N8N_WEBHOOK_TARGET`**, not `MYASSIST_N8N_WEBHOOK_URL`. |
| **Supabase CLI** errors on `link` / “Invalid access token” | **`SUPABASE_ACCESS_TOKEN`** in env is not a **CLI** token (or is a different product’s) | `SUPABASE_ACCESS_TOKEN` is for **CLI** only — do not confuse with JS keys. See `supabase/README.md` in repo. |
| **`package-lock.json` appears** | Policy is **pnpm only** | Do not commit. Remove and use `pnpm install`. `AGENTS.md` states pnpm for MyAssist. |

---

## Environment variables (canonical)

- **Source of truth for team dev:** [Infisical](https://infisical.com) — **`/platform` + `/myassist`**, `dev` env (and prod as applicable).
- **Catalog and comments:** `apps/web/.env.example` (read this before copying to `.env.local`).
- **Production-like validation:** `pnpm --prefix apps/web run check:env:prod` (fails if critical vars missing, including **`NEXT_PUBLIC_SITE_URL`**, **`AUTH_SECRET`**, BKI-019 Google/Microsoft/Resend when `NODE_ENV=production` / `VERCEL_ENV=production` or `--production-like`).

### Must be correct for “always return to MyAssist” (hosted)

- **`NEXT_PUBLIC_SITE_URL`**: public **MyAssist** origin (same as users see in the address bar for this app). Baked at **build** time. Without it, OAuth/magic-link **`redirectTo`** follows **`window.location.origin`**, which is wrong if the user opened a **sibling** Bookiji URL.
- **`AUTH_URL`**: public origin for **server** redirects, password reset, integration OAuth; should match MyAssist in production. **`resolvePublicOrigin`** can prefer **forwarded host** over a stale `AUTH_URL` in production — but client-side `redirectTo` still depends on **`NEXT_PUBLIC_SITE_URL`**.

### Do *not* rely on in `apps/web` (Next) runtime in the way people sometimes assume

- **`VERCEL_TOKEN`**: Vercel **CLI/API**, not Next's `process.env` for users.
- **`VITE_SUPABASE_*`**: optional legacy **aliases** for URL/key; `NEXT_PUBLIC_SUPABASE_*` is enough for this Next app if set.
- **`MYASSIST_N8N_*` (webhook / API)**: not used by default Next **daily context** (live provider path). Safe to omit for core product.

---

## Google Cloud / Microsoft (login providers)

- **Supabase** drives login OAuth; “Continue with Google/Microsoft” use **`signInWithOAuth`** with `redirectTo` to **`/auth/callback`** on the **MyAssist** origin.
- In **Google Cloud Console** and **Entra / Azure**, allow redirect URIs your **Supabase project** uses (as configured in Supabase provider settings), and ensure **Authorized JavaScript origins** include the **MyAssist** public origin.
- If debugging “wrong app” redirects, verify **both** (1) **`NEXT_PUBLIC_SITE_URL`** on the MyAssist deployment and (2) **Supabase** URL allow list — not just Google.

---

## Supabase (dashboard)

- **Site URL** should be the **MyAssist** production (or preview) origin you actually use.
- **Redirect URLs** must include `http://localhost:3000/**` (and port variants if you dev on 3001+) **and** your production MyAssist origin with `/auth/callback` and related paths.
- For **forgot password**, **Resend** and sender env vars are required in production; see `check:env:prod` and BKI-019 copy in `apps/web/README.md`.

---

## Code references (for maintainers)

| Area | File(s) |
|------|--------|
| Client `redirectTo` / magic link target | `lib/authPublicOrigin.ts` |
| PKCE callback, `ensureAppUser` | `lib/auth/completeAuthCallback.ts`, `app/auth/callback/route.ts` |
| Server session, stale refresh handling | `lib/supabaseServer.ts` |
| Sign-in error mapping | `app/sign-in/SignInForm.tsx` — `AUTH_ERROR_COPY` |
| Public origin (forwarded host vs `AUTH_URL`) | `lib/integrations/origin.ts`, `lib/myassistSiteOrigin.ts` |
| Env readiness | `lib/env/envReadiness.ts`, `scripts/check-env-readiness.ts` |

---

## LLM / operator one-shot prompt (paste when asking for help)

> **Context:** MyAssist Next.js app (`apps/web`), Supabase Auth, PKCE `/auth/callback`, `ensureAppUser` to `myassist.app_users`, pnpm-only, Infisical `/platform`+`/myassist`.
> **Rules:** `NEXT_PUBLIC_SITE_URL` must be the MyAssist public origin in production; missing it causes OAuth/magic link `redirectTo` to follow `window.location.origin` and send users to a **sibling Bookiji host**. `refresh_token_not_found` on `/` = stale cookies (sign-out cleanup exists). E2E boot waits for Next on **3005**. Do not add `package-lock.json`. Do not set `VERCEL_TOKEN` for app auth.
> **If bug:** state symptom, host (local vs Vercel), and whether `NEXT_PUBLIC_SITE_URL` / Supabase Site URL are set. Read [docs/TROUBLESHOOTING.md](./TROUBLESHOOTING.md) and [auth-supabase-callback.md](./auth-supabase-callback.md).

---

*Last consolidated from auth-stabilization work, env hardening, Playwright type fixes, and runtime log analysis (e.g. local OAuth `redirectTo` host = `localhost` when `NEXT_PUBLIC_SITE_URL` unset). Update this file when new recurring incidents appear.*
