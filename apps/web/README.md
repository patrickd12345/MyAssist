# MyAssist Web App

Interactive assistant UI over normalized daily context from n8n.

## What this app does

- Shows a structured daily brief from Todoist, Gmail, and Google Calendar context.
- Calls n8n server-side through `/api/daily-context`.
- Exposes an interactive assistant through `/api/assistant`.
- Uses local Ollama when reachable and deterministic fallback when not.
- Supports explicit Todoist task completion from the dashboard.
- Supports press-and-hold defer actions from the task button.
- Supports AI-drafted task creation with explicit confirmation in the assistant console.
- Still avoids autonomous Todoist writes in v1.

## Sign-in

The dashboard and APIs require a local account (email + password). Unauthenticated visitors are redirected to `/sign-in`.

1. Open `/sign-in`, choose **Register**, and create an account (password at least 8 characters).
2. Credentials are stored in `apps/web/.myassist-memory/users.json` (hashed passwords only).
3. Set `AUTH_SECRET` (or `NEXTAUTH_SECRET`) in `apps/web/.env.local` — use a long random string in production.
4. Optional: set `AUTH_URL` to the public origin (e.g. `http://localhost:3000` locally).
5. For Vitest and local scripting only, `MYASSIST_AUTH_DISABLED=true` skips login checks (see `vitest.setup.ts`).

Session protection is enforced in server components and API route handlers (no Edge middleware, to avoid bundling issues with Auth.js on Vercel Edge).

## Local run

For UI-only work, leave `MYASSIST_N8N_WEBHOOK_URL` empty and the app will use mock data automatically in development.

For live local integration:

1. Import `n8n/myassist_unified.json` into local n8n.
2. Configure credentials for:
   - Todoist
   - Gmail
   - Google Calendar
3. Ensure the workflow contains:
   - `Cron - 01:00 Local`
   - `Webhook - Fetch Daily Context`
4. Activate the workflow.
5. Copy the production URL from `Webhook - Fetch Daily Context`.
6. Put that URL in `apps/web/.env.local` as `MYASSIST_N8N_WEBHOOK_URL`.
7. If the webhook is protected, also set `MYASSIST_N8N_WEBHOOK_TOKEN`.
8. Optionally set:
   - `OLLAMA_BASE_URL`
   - `OLLAMA_MODEL`
   - `TODOIST_API_TOKEN` if you want to complete tasks from the dashboard

From repo root:

```sh
npm run web:dev
```

Then open `http://localhost:3000`.

## Environment variables

Set in `apps/web/.env.local`:

- `AUTH_SECRET` (or `NEXTAUTH_SECRET`): secret for Auth.js session cookies (required for `next build` / production; dev-only fallback when unset in development)
- `MYASSIST_REGISTRATION_INVITE_CODE`: optional; when set, registration must send the same value as `inviteCode` in the JSON body
- `AUTH_URL`: public site URL (recommended; e.g. `http://localhost:3000`)
- `MYASSIST_AUTH_DISABLED`: set to `true` only for tests or special local setups (disables auth gates)
- `MYASSIST_DEV_USER_ID`: user id to use when auth is disabled
- `MYASSIST_USER_STORE_FILE`: optional path to the JSON user registry (default: `.myassist-memory/users.json`)
- `MYASSIST_N8N_WEBHOOK_URL`: n8n production webhook URL
- `MYASSIST_N8N_WEBHOOK_TOKEN`: optional Bearer token
- `MYASSIST_USE_MOCK_CONTEXT`: optional `true` for demo data in production
- `OLLAMA_BASE_URL`: optional local Ollama base URL, default `http://127.0.0.1:11434`
- `OLLAMA_MODEL`: optional Ollama model name, default `llama3.2:3b`
- `TODOIST_API_TOKEN`: required for dashboard completion, defer actions, and confirmed task creation from the assistant

Notes:

- In local development, mock data is used automatically when `MYASSIST_N8N_WEBHOOK_URL` is empty.
- The app always calls n8n server-side.
- The assistant route falls back gracefully if Ollama is unavailable.

## Validation commands

```sh
npm run web:lint
npm run web:build
```

## Troubleshooting (Next.js dev)

If the dev server throws **Cannot find module './NNN.js'** under `apps/web/.next/server`, the webpack cache is out of date. Stop `next dev`, run `npm run web:clean` from the repo root (or delete the `apps/web/.next` folder), then start dev again.

If `/api/auth/session` returns **500** and logs show **MissingSecret**, set `AUTH_SECRET` in `apps/web/.env.local` (32+ random characters). In **development** only, a local fallback is used when both secrets are unset; **production** requires an explicit secret. Restart `next dev` after pulling auth changes.

If logs show **Array buffer allocation failed** or **Caching failed for pack** from webpack, the dev server is running low on memory. The `pnpm dev` script sets a larger Node heap (`NODE_OPTIONS=--max-old-space-size=6144`) and dev mode disables webpack disk cache to reduce this. Close other heavy apps, run `npm run web:clean`, then `pnpm dev` again.

## Local smoke test

1. Start n8n and activate the workflow.
2. Start the web app with `npm run web:dev`.
3. Load `http://localhost:3000`.
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

## Travel/demo mode

Flow:

- Vercel app -> public tunnel URL -> local webhook-only proxy -> local n8n

Rules:

- Expose only the local proxy endpoint.
- Do not expose the n8n editor or admin UI.
- Protect the webhook with `MYASSIST_N8N_WEBHOOK_TOKEN` if the tunnel is public.

Setup:

1. Start local n8n and activate the workflow.
2. Start the webhook-only proxy:

```sh
npm run tunnel:proxy
```

3. Start the tunnel:

```sh
npm run tunnel:ngrok
```

4. Copy the public tunnel URL and append `/webhook/myassist-daily-context`.
5. Set that full URL in Vercel as `MYASSIST_N8N_WEBHOOK_URL`.
6. If webhook auth is enabled, set the same token in Vercel as `MYASSIST_N8N_WEBHOOK_TOKEN`.
7. Open the deployed app and verify briefing refresh and assistant prompts still work.
