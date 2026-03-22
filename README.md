# MyAssist v1

Personal operations system centered on Todoist, Gmail, n8n, and ChatGPT.

## What this includes

- `n8n/myassist_unified.json`: **Only workflow export** — pulls Todoist + Gmail + Calendar, then **Normalize Aggregated Data** outputs one JSON payload for the **Custom GPT (MyAssist Operator)** and for the **web app**. Includes **Cron** (scheduled) and **Webhook - Fetch Daily Context** (on-demand HTTP). No LLM inside n8n. **No** auto task creation from email. Re-import when the graph changes.
- `apps/web/`: **Read-only Next.js dashboard** — fetches the same normalized JSON via the n8n production webhook (`MYASSIST_N8N_WEBHOOK_URL`). **Copy JSON** button pastes into the Custom GPT. See [Web app](#web-app-read-only-dashboard).
- `prompts/email_triage_prompt.txt`: Optional reference if a future Gmail->Todoist automation is built (not shipped as n8n JSON in this repo).
- `prompts/daily_digest_prompt.txt`: Legacy reference (previously matched an in-n8n digest step). Interpretation and output format live in the Custom GPT instructions.
- `.env.example`: Required variables and safe defaults.
- `docs/architecture.md`: System boundaries, trust boundaries, and failure modes.

## v1 Operating Rules

- Todoist is the single source of truth.
- Siri is capture only.
- n8n is orchestration only.
- ChatGPT is reasoning only.
- No bidirectional sync in v1.
- No autonomous global reprioritization in v1.
- **Default v1:** no automated Todoist writes from Gmail; planning and task wording happen in **ChatGPT**, then tasks are committed in Todoist (manually, Siri, or a future connector).

## Daily context (primary n8n automation)

Purpose:
- Produce **normalized JSON** from Todoist, Gmail signals, and Google Calendar for the Custom GPT to turn into a plan.

Behavior:
- Trigger at local 01:00 (configurable in Cron node).
- Pull active Todoist tasks and split into overdue, due today, and high-priority upcoming.
- Pull Gmail signals (default: recent starred).
- Pull today calendar events.
- **Normalize Aggregated Data** (terminal node) outputs JSON including:
  - `generated_at`, `run_date`
  - `todoist_overdue`, `todoist_due_today`, `todoist_upcoming_high_priority`
  - `gmail_signals`, `calendar_today`

### ChatGPT and tasks (interactive)

- n8n supplies **facts** (normalized JSON); the Custom GPT supplies **priorities, plan, and Todoist-sized wording**.
- Actually **creating** tasks in Todoist from chat can be: copy/paste into Todoist, Siri capture, or later a **Custom GPT / Actions** calling the Todoist API (not included here).

## Web app (read-only dashboard)

Purpose: second UI over the **same** JSON as the Custom GPT — browse overdue / due today / calendar / Gmail signals; **Copy JSON** for pasting into ChatGPT.

Setup:

1. Re-import `n8n/myassist_unified.json` and **activate** the workflow (production webhook only works when active).
2. In n8n, open **Webhook - Fetch Daily Context** and copy the **Production URL** (path `myassist-daily-context`, GET, response **When Last Node Finishes** → **First Entry JSON**).
3. In `apps/web`, copy `apps/web/.env.example` to `apps/web/.env.local` and set:
   - `MYASSIST_N8N_WEBHOOK_URL` — full production webhook URL from step 2.
   - `MYASSIST_N8N_WEBHOOK_TOKEN` — optional; set if the webhook uses Header/Bearer auth in n8n (same value the server must send).
4. From repo root: `pnpm web:dev` (or `cd apps/web && pnpm dev`). Open `http://localhost:3000`.

Deploy (e.g. Vercel): add the same env vars to the project; the app calls n8n **server-side** only (`/api/daily-context` and the home page loader).

## Apple Reminders -> Todoist (one-time migration helper)

This repo now includes two helper scripts to automate most of the copy:

- `tools/export-apple-reminders.jxa` (macOS) exports Apple Reminders to JSON.
- `tools/import-apple-reminders-to-todoist.mjs` imports that JSON into Todoist with dedupe.

### One-command export (do this)

On macOS, run the helper script (handles permission prompt and writes to Desktop by default):

```sh
bash tools/export-reminders.sh

