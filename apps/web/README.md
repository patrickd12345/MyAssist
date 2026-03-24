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

- `MYASSIST_N8N_WEBHOOK_URL`: n8n production webhook URL
- `MYASSIST_N8N_WEBHOOK_TOKEN`: optional Bearer token
- `MYASSIST_USE_MOCK_CONTEXT`: optional `true` for demo data in production
- `OLLAMA_BASE_URL`: optional local Ollama base URL, default `http://127.0.0.1:11434`
- `OLLAMA_MODEL`: optional Ollama model name, default `llama3.2:3b`
- `TODOIST_API_TOKEN`: required only for dashboard task completion
- `TODOIST_API_TOKEN`: required for dashboard completion and defer actions
- `TODOIST_API_TOKEN`: required for dashboard completion, defer actions, and confirmed task creation

Notes:

- In local development, mock data is used automatically when `MYASSIST_N8N_WEBHOOK_URL` is empty.
- The app always calls n8n server-side.
- The assistant route falls back gracefully if Ollama is unavailable.

## Validation commands

```sh
npm run web:lint
npm run web:build
```

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
