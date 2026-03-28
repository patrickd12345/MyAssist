# MyAssist Web App

Interactive assistant UI as a unified live window over connected provider systems.

## What this app does

- Shows a structured daily brief from live Gmail, Google Calendar, and Todoist reads.
- Builds the unified Today view in app services and adapters.
- Exposes an interactive assistant through `/api/assistant`.
- Uses local Ollama when reachable and deterministic fallback when not.
- Uses a light-first visual theme by default, with optional dark/art themes.
- Supports direct Todoist task completion from the dashboard.
- Supports press-and-hold defer actions from the task button.
- Supports AI-drafted task creation with explicit confirmation in the assistant console.
- Avoids autonomous provider writes in v1.

## Source of truth

- Gmail owns emails.
- Google Calendar owns events.
- Todoist owns tasks.
- MyAssist does not maintain local mirror tables for provider entities.

## Today UI layout

The Today dashboard is organized into focused tabs to reduce visual overload:

- `Overview`: headline, metrics, first move, and situation brief
- `Tasks`: overdue/today lists and brief picks
- `Inbox`: important emails and job-hunt email assignment controls
- `Calendar`: today's events
- `Assistant`: compact assistant console

## Sign-in

The dashboard and APIs require a local account (email + password). Unauthenticated visitors are redirected to `/sign-in`.

1. Open `/sign-in`, choose **Register**, and create an account (password at least 8 characters).
2. Credentials are stored in `apps/web/.myassist-memory/users.json` (hashed passwords only).
3. Set `AUTH_SECRET` (or `NEXTAUTH_SECRET`) in `apps/web/.env.local` — use a long random string in production.
4. Optional: set `AUTH_URL` to the public origin (e.g. `http://localhost:3000` locally).
5. For Vitest and local scripting only, `MYASSIST_AUTH_DISABLED=true` skips login checks (see `vitest.setup.ts`).

Session protection is enforced in server components and API route handlers (no Edge middleware, to avoid bundling issues with Auth.js on Vercel Edge).

## Production (Vercel, e.g. myassist.bookiji.com)

You may have **more than one** Vercel project pointing at this repo (e.g. **`web`** vs **`my-assist`**). **Environment variables are per project.** If runtime logs show `MissingSecret` on one hostname but not another, open **Vercel → that project → Settings → Environment Variables** and ensure **`AUTH_SECRET`** (and **`AUTH_URL`**) exist for **Production** (and **Preview** if you use preview URLs).

The Vercel project linked to production should use this app as the deploy root:

- **Git repository:** `patrickd12345/MyAssist`, branch `main`
- **Monorepo root:** leave **Root Directory** empty in the Vercel dashboard (repo root). Deployment config lives in **`vercel.json`** at the repo root: install → `pnpm install`, build → **`pnpm run vercel-build`** (`pnpm --filter web run build`), **output** → **`apps/web/.next`** so Vercel finds the Next.js build output.
- **Next.js detector:** the repo **root** `package.json` lists **`next`** (same version as `apps/web`) so Vercel recognizes the framework while the real app code stays under **`apps/web`**.
- **Production env:** set at least `AUTH_SECRET` and `AUTH_URL` (public origin, e.g. `https://myassist.bookiji.com`). Add the **same** `AUTH_SECRET` (and other secrets) under **Preview** too if you use preview deployments—otherwise `NODE_ENV=production` previews will fail auth at runtime. Mirror any Supabase / OAuth values from `apps/web/.env.example` so hosted mode matches local behavior. The CLI has no one-shot “import `.env`” command; use the dashboard **bulk paste** or run `scripts/push-env-to-vercel.ps1` from `apps/web` (see script header). Review keys before pushing—overwrite uses `vercel env add --force`.
- **Custom domain:** assign `myassist.bookiji.com` to this project’s Production deployment in Vercel → Domains.
- **Deployment Protection (Vercel Authentication):** If anonymous hits to `*.vercel.app` return **401** and an HTML **Vercel** login page (not your app), the project has **Vercel Authentication** enabled. The Vercel CLI does not toggle this; use **Project → Settings → Deployment Protection** or `PATCH /v10/projects/{name}` with `{"ssoProtection":null}` and a bearer token. Re-enable protection if you need private previews.
- **OAuth + integration pills on Vercel:** Gmail/Todoist/Calendar tokens are stored in **Supabase** when `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SECRET_KEY` are set; otherwise the app falls back to **`.myassist-memory` on disk**, which **does not persist** on serverless. If OAuth finishes but pills stay “disconnected”, configure Supabase env vars and redeploy. After connect, the dashboard shows a short **OAuth completed** banner and refetches status (query `?integrations=connected` is stripped from the URL).

## Local run

1. Copy `apps/web/.env.example` to `apps/web/.env.local`.
2. Configure provider OAuth credentials and optional local model settings.
3. Start the app from repo root:

   ```sh
   npm run web:dev
   ```

4. Open `http://localhost:3000`.
5. Connect Gmail, Google Calendar, and Todoist from the Integrations section.

## Environment variables

Set in `apps/web/.env.local`:

- `AUTH_SECRET` (or `NEXTAUTH_SECRET`): secret for Auth.js session cookies (required for `next build` / production; dev-only fallback when unset in development)
- `MYASSIST_REGISTRATION_INVITE_CODE`: optional; when set, registration must send the same value as `inviteCode` in the JSON body
- `AUTH_URL`: public site URL (recommended; e.g. `http://localhost:3000`)
- `NEXTAUTH_URL`: optional alias for app public URL (used as OAuth redirect base when `AUTH_URL` is unset)
- `MYASSIST_PUBLIC_APP_URL`: optional explicit OAuth redirect base URL fallback
- `MYASSIST_AUTH_DISABLED`: set to `true` only for tests or special local setups (disables auth gates)
- `MYASSIST_DEV_USER_ID`: user id to use when auth is disabled
- `MYASSIST_USER_STORE_FILE`: optional path to the JSON user registry (default: `.myassist-memory/users.json`)
- `MYASSIST_USE_MOCK_CONTEXT`: set to `true` or `1` to serve **mock** daily context instead of live Gmail/Calendar/Todoist reads (useful for UI dev without OAuth)
- `MYASSIST_INTEGRATIONS_ENCRYPTION_KEY`: optional; **if unset**, encryption uses a hash of `AUTH_SECRET` (or a dev fallback). Set an explicit key for production and keep it identical on Vercel and locally if you share one Supabase DB — generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `GOOGLE_CLIENT_ID`: Google OAuth client id for Gmail + Calendar connect flow
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret for Gmail + Calendar connect flow
- `TODOIST_CLIENT_ID`: Todoist OAuth client id for direct task actions
- `TODOIST_CLIENT_SECRET`: Todoist OAuth client secret
- `OLLAMA_BASE_URL`: optional local Ollama base URL, default `http://127.0.0.1:11434`
- `OLLAMA_MODEL`: optional Ollama model name, default `llama3.2:3b`
- `TODOIST_API_TOKEN`: optional global fallback for Todoist REST if the user has not completed Todoist OAuth; dashboard actions need **either** OAuth **or** this token **or** a per-user token in the user registry (see `resolveTodoistApiToken` behavior in code)

Notes:

- **Daily context** default path (`GET /api/daily-context`) builds the Today payload from **live** provider APIs. The response header `x-myassist-context-source` is **`live`**, **`mock`**, or **`cache`** (`?source=cache` loads the last written snapshot from disk under `.myassist-memory` — useful for debugging, not a canonical data store).
- Provider data is fetched live on demand.
- Writes are sent directly to provider APIs.
- UI state should auto-refresh after successful writes.
- The assistant route falls back gracefully if Ollama is unavailable.
- Inbox rows show **Mark as read** or **Mark as unread** from Gmail `label_ids` (OAuth `batchModify` on `UNREAD`).
- Integration statuses and connect links are available in the dashboard header (Gmail, Todoist, Calendar).
- OAuth redirect URIs are built from `AUTH_URL` (then `NEXTAUTH_URL`, then `MYASSIST_PUBLIC_APP_URL`, then request origin). Register the exact callback URL in provider consoles, for example:
  - `http://localhost:3000/api/integrations/gmail/callback`
  - `http://localhost:3000/api/integrations/google_calendar/callback`
  - `http://localhost:3000/api/integrations/todoist/callback`

## Validation commands

```sh
npm run web:lint
npm run web:build
```

## Troubleshooting (Next.js dev)

If the dev server throws **Cannot find module './NNN.js'** under `apps/web/.next/server`, the webpack cache is out of date. Stop `next dev`, run `npm run web:clean` from the repo root (or delete the `apps/web/.next` folder), then start dev again.

If routes (e.g. **Gmail OAuth callback**) fail with **Cannot find module './vendor-chunks/@sentry+core@…'** on **Vercel or locally**, ensure you are on the current `next.config.ts` (no `withSentryConfig` — see file comment), redeploy, and run `npm run web:clean` before `next dev` if testing locally. Stale `.next` from older builds can keep broken chunk references until cleaned.

If `/api/auth/session` returns **500** and logs show **MissingSecret**, set `AUTH_SECRET` in `apps/web/.env.local` (32+ random characters). In **development** only, a local fallback is used when both secrets are unset; **production** requires an explicit secret. Restart `next dev` after pulling auth changes.

If logs show **Array buffer allocation failed** or **Caching failed for pack** from webpack, the dev server is running low on memory. The `pnpm dev` script sets a larger Node heap (`NODE_OPTIONS=--max-old-space-size=6144`) and dev mode disables webpack disk cache to reduce this. Close other heavy apps, run `npm run web:clean`, then `pnpm dev` again.

## Local smoke test

1. Start the web app with `npm run web:dev`.
2. Load `http://localhost:3000`.
3. Connect Gmail, Google Calendar, and Todoist.
4. Confirm the page shows live Todoist, Gmail, and Calendar data.
5. Open the assistant console and ask a question.
6. Confirm `/api/assistant` answers with:
   - `mode: "ollama"` when the local model is reachable, or
   - `mode: "fallback"` when it is not
7. Click `Complete` on a Todoist task and confirm it disappears from the dashboard.
8. Press and hold `Complete` on a Todoist task and confirm a defer menu appears with:
   - `Defer this afternoon` when the current time is morning
   - `Defer tomorrow`
   - `Defer next week`
9. Ask the assistant to create a task, confirm a draft card appears, then click `Create task`.
