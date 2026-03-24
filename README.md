# MyAssist v1

Personal operations system centered on Todoist, Gmail, n8n, and a local-first assistant UI.

## What this includes

- `n8n/myassist_unified.json`: only workflow export. Pulls Todoist, Gmail, and Calendar, then `Normalize Aggregated Data` outputs one JSON payload for the web app and assistant layer. Includes both `Cron` and `Webhook - Fetch Daily Context`. No LLM inside n8n.
- `apps/web/`: Next.js assistant surface. Fetches the normalized JSON from n8n, renders an operator-style briefing, and exposes an interactive assistant console backed by local Ollama when available with deterministic fallback when not.
- `prompts/email_triage_prompt.txt`: optional reference if a future Gmail-to-Todoist automation is built.
- `prompts/daily_digest_prompt.txt`: legacy reference from an earlier digest path.
- `.env.example`: required variables and safe defaults.
- `docs/architecture.md`: boundaries, trust model, and failure modes.
- `docs/n8n-google-oauth.md`: fix Google OAuth redirect mismatch in n8n.
- `docs/n8n-local-merge-version.md`: local n8n compatibility notes.
- `PROJECT_TRACKER.md`: live execution tracker for the local-first build.

## Tooling preference

- Default command examples use `npm`.
- Preferred hybrid runtime:
  - `apps/web` on `npm`
  - `n8n` on Docker

## Build strategy

- Primary goal now:
  - finish a strong local single-user version
- Architecture goal now:
  - keep boundaries stable so a future commercial version does not require a rewrite
- Explicit non-goals for the current phase:
  - no multi-tenant auth
  - no billing system
  - no BYOK implementation flow
  - no orchestration platform migration before the local version is working well

## Hosting strategy

- Development:
  - local PC orchestration is acceptable while workflows, connectors, and payload contracts are still changing
- Travel/demo:
  - the Vercel app may call local n8n through a tunnel
  - only the webhook endpoint should be exposed publicly
  - the n8n editor/admin surface must stay private
  - use the local webhook-only proxy rather than tunneling n8n directly
- Pilot and commercial:
  - run `apps/web` on Vercel
  - run orchestration on hosted n8n or another managed worker platform
  - do not rely on a personal computer for paid usage

## Migration-safe rule

- Keep `n8n/myassist_unified.json` as the workflow source of truth.
- Keep secrets in env vars or n8n credentials only.
- Keep one stable webhook contract between the app and n8n.
- Test from the app against the webhook URL, not internal n8n nodes.
- When moving to hosted n8n, import workflow JSON, recreate credentials, activate the workflow, update deployment env vars, and run one end-to-end smoke test.

## Operating modes

- Local mode:
  - local app -> local n8n
- Travel/demo mode:
  - Vercel app -> tunnel -> local webhook-only proxy -> local n8n
- Hosted mode:
  - Vercel app -> hosted n8n

## v1 operating rules

- Todoist is the single source of truth.
- Siri is capture only.
- n8n is orchestration only.
- The assistant layer is reasoning only.
- No bidirectional sync in v1.
- No autonomous global reprioritization in v1.
- Default v1: no automated Todoist writes from Gmail.

## Daily context

Purpose:

- Produce normalized JSON from Todoist, Gmail signals, and Google Calendar for the UI and assistant.

Behavior:

- Trigger at local 01:00 through Cron.
- Pull active Todoist tasks and split into overdue, due today, and high-priority upcoming.
- Pull Gmail signals.
- Pull calendar events.
- `Normalize Aggregated Data` outputs:
  - `generated_at`, `run_date`
  - `todoist_overdue`, `todoist_due_today`, `todoist_upcoming_high_priority`
  - `gmail_signals`, `calendar_today`

## Web app (interactive assistant)

Purpose:

- Render an operator-style daily brief over the normalized context.
- Let you ask questions against the live snapshot.
- Return answers, suggested actions, and follow-up prompts.

Setup:

1. Re-import `n8n/myassist_unified.json` and activate the workflow.
2. In n8n, open `Webhook - Fetch Daily Context` and copy the production URL.
3. In `apps/web`, copy `apps/web/.env.example` to `apps/web/.env.local` and set:
   - `MYASSIST_N8N_WEBHOOK_URL`
   - `MYASSIST_N8N_WEBHOOK_TOKEN` if needed
   - `MYASSIST_USE_MOCK_CONTEXT` optionally for demo mode
   - `OLLAMA_BASE_URL` optionally, default `http://127.0.0.1:11434`
   - `OLLAMA_MODEL` optionally, default `llama3.2:3b`
4. From repo root run `npm run web:dev`.
5. Open `http://localhost:3000`.

Assistant behavior:

- The homepage includes a live assistant console.
- Questions are answered against the current daily context snapshot.
- If Ollama is reachable, replies come from the local model.
- If Ollama is not reachable, the assistant falls back to deterministic reasoning so the app still works.
- Todoist tasks can be completed explicitly from the dashboard when `TODOIST_API_TOKEN` is configured.
- Todoist tasks can also be deferred from the same button by press-and-hold, using explicit schedule options.
- The assistant can draft new Todoist tasks, but the write still requires explicit user confirmation.
- Assistant responses include:
  - `answer`
  - `actions`
  - `followUps`
  - `mode`

Verification:

- `GET /api/daily-context` should return normalized JSON.
- `POST /api/assistant` should return JSON with `mode`, `answer`, `actions`, and `followUps`.
- `mode=ollama` means the local model is active.
- `mode=fallback` means the assistant is running on built-in heuristics.

## Local n8n (Docker preferred)

Use Docker for local n8n so it can restart automatically with Docker Desktop and stay out of your shell lifecycle.

1. Make sure Docker Desktop is installed and set to start when you log in.
2. From repo root, start n8n:

```sh
npm run n8n:docker:up
```

3. Open `http://localhost:5678` and complete first-run owner setup.
4. In n8n UI, import `n8n/myassist_unified.json`.
5. Reconnect credentials, then activate the workflow.
6. Copy the webhook production URL into `apps/web/.env.local` as `MYASSIST_N8N_WEBHOOK_URL`.

Useful commands:

```sh
npm run n8n:docker:logs
npm run n8n:docker:restart
npm run n8n:docker:down
```

## Local n8n (npm fallback)

If needed:

```sh
npm run n8n:dev
```

## Tunnel mode

Do not expose local n8n directly. Tunnel the local webhook-only proxy instead.

Start local services:

```sh
npm run n8n:docker:up
npm run web:dev
npm run tunnel:proxy
```

Start the tunnel:

```sh
npm run tunnel:ngrok
```

Then set:

- `MYASSIST_N8N_WEBHOOK_URL=https://<ngrok-domain>/webhook/myassist-daily-context`
- `MYASSIST_N8N_WEBHOOK_TOKEN=<same bearer token if enabled>`

## Required accounts and credentials

- n8n instance
- Google account with Gmail and Google Calendar access
- Todoist account with API token
- Optional local Ollama runtime for model-backed assistant answers

In n8n, configure:

- Gmail credential
- Google Calendar credential
- Todoist auth

## Commercial guardrail

Build the local single-user product first. Keep boundaries stable so future auth, billing, BYOK, and hosted orchestration can be added without rewriting the core app.
