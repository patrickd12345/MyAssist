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

Typical flow:

1. On Mac, export reminders:
   - `pnpm reminders:export:mac`
   - Output file: `~/Desktop/apple-reminders-export.json`
2. Set Todoist token in shell:
   - PowerShell: `$env:TODOIST_API_TOKEN="..."` (or export on macOS/zsh)
3. Dry run import first:
   - `pnpm reminders:import -- --input "~/Desktop/apple-reminders-export.json"`
4. Apply import:
   - `pnpm reminders:import -- --input "~/Desktop/apple-reminders-export.json" --apply`

Flags:

- `--include-completed`: include completed reminders (default is skip completed).
- `--no-dedupe`: disable dedupe against existing Todoist tasks.
- `--no-list-label`: do not map reminder list name to Todoist label.

Notes:

- Dedupe key is `content + due` (case-insensitive content).
- Due dates are imported as `due_datetime` when available.
- Always run the dry run first to inspect counts and payload preview.

## Required accounts and credentials

- n8n instance (local or hosted)
- Google account with Gmail + Google Calendar access
- Todoist account with API token

In n8n, configure:
- Gmail credential (OAuth2)
- Google Calendar credential (OAuth2)
- **Todoist** via Variables or Header Auth (see below). **No OpenAI key in n8n** for this workflow.

### n8n Cloud: why there is no Variables section

Per [n8n docs](https://docs.n8n.io/code/variables/), **Custom variables (`$vars`)** are only on **Pro Cloud** and **Enterprise**. **Starter / trial** instances often **do not** show a Variables tab — that is expected, not a bug.

**Option A — Pro Cloud / Enterprise:** **Overview** or **Project** → **Variables** tab → add `TODOIST_API_TOKEN` (and any other names referenced in the HTTP node). Workflows use `$vars` in expressions.

**Option B — Starter (no Variables): use Credentials instead**

1. **Credentials** → **Add credential** → **Header Auth** (name e.g. `Todoist REST`).
   - Header **name:** `Authorization`
   - Header **value:** `Bearer` + space + your Todoist API token (paste the token from Todoist → Settings → Integrations).
2. Open **Todoist – Get Active Tasks** → **Authentication** → **Generic Credential Type** → **Header Auth** → select `Todoist REST`. **Remove** the duplicate `Authorization` row from **Header Parameters** if the node still has one (credential supplies the header).

**Option C — Quick test only:** paste `Bearer <token>` directly into the **Authorization** header field (not safe to keep long-term; rotate token if exposed).

HTTP Request / Code nodes in the repo JSON assume **Option A** (`$vars`). After switching to **Option B**, edit those nodes in the UI as above, or keep `$vars` if upgrading to Pro.

## Which JSON to import

- Import **`n8n/myassist_unified.json`** (only workflow export in this repo).

## Import steps

1. Create folder structure (already provided in this repo layout).
2. Copy `.env.example` to your runtime env file and fill real values.
3. In n8n:
   - Import `n8n/myassist_unified.json`.
4. Open the workflow and confirm:
   - node credentials are attached (Gmail, Calendar, and **Todoist** via Variables **or** Header Auth — see above)
   - If on Pro: Variables match `.env.example` names; if on Starter: Header Auth credentials replace `$vars` on HTTP nodes
   - Gmail and Calendar scopes are authorized.
5. Activate workflows when tests pass.

## How to connect credentials in n8n

- Gmail Trigger / Gmail nodes:
  - connect Gmail OAuth2 credential
  - ensure inbox read scope
- Google Calendar node:
  - connect Calendar OAuth2 credential
  - ensure calendar read scope
- Todoist:
  - no hardcoded token in node fields
  - token only via **Variables** (`$vars`) or Header Auth credential

## n8n Cloud: sync canvas with this repo

The JSON under `n8n/` is the source of truth for structure. If the cloud editor was edited by hand (wrong Todoist URL, hardcoded token), re-import the file or align nodes to match:

- Todoist HTTP nodes: `GET` `https://api.todoist.com/api/v1/tasks` with `Authorization: Bearer {{$vars.TODOIST_API_TOKEN}}` (Todoist deprecated `/rest/v2/`; use `/api/v1/`).
- **Todoist v1 response shape:** list endpoints return `{ "results": [ ...tasks ] }`, not a bare array. **Normalize Aggregated Data** unwraps `results` (and still accepts a top-level array or `items` if present).
- Merge: use **two** Merge nodes (Todoist+Gmail, then +Calendar); a single Merge only has two inputs. Use **Append** on both Merge nodes (not **Combine → All combinations**), or **0 Gmail messages** can make the Merge output **no items** and the Code node never runs.
- Terminal node is **Normalize Aggregated Data** (no OpenAI node in this workflow).

### Gmail + Calendar after re-import (avoid extra clicks)

- **Gmail:** The node sets **Read status = unread and read** (`readStatus: both`) inside **Filters**. The default in n8n is often unread-only; **starred messages are usually already read**, so the list looked empty until the node was opened and saved. If the repo JSON is updated, re-import should keep the query without that “go in and out” workaround.
- **Google Calendar:** Calendar ID is stored as **`pilotmontreal@gmail.com`** (by ID, not `primary`) so the correct calendar survives import. Edit the **Calendar** field in the node if the account changes.
- **OAuth credentials:** n8n still stores **Gmail / Google Calendar** credentials on the instance, not inside the workflow file. After a **new** instance or a **new** credential, pick the Gmail and Google Calendar OAuth credentials once on those nodes. That part cannot be encoded in JSON.

## After tests are green: rotate Todoist token

1. In Todoist settings, regenerate the API token (invalidates the old one).
2. Update the n8n Variable `TODOIST_API_TOKEN` only (no token pasted into node expressions).
3. Optional: rotate n8n Instance MCP bearer if it was ever exposed.

## Test the daily context

- Run the workflow manually from n8n (Execute workflow).
- Open **Normalize Aggregated Data** and confirm JSON fields (`todoist_overdue`, `calendar_today`, etc.) look right.
- **Where to see it:** after a run, click **Normalize Aggregated Data** (last node) → **OUTPUT** panel → **JSON** tab. If that node never runs, the run stopped earlier (Merge used to output **0 items** when Gmail had no messages — the workflow uses **Merge → Append** so the Todoist branch still runs).
- Paste that JSON into the Custom GPT (MyAssist Operator) and confirm the operating plan.

## Troubleshooting

- **`The workflow has issues and cannot be executed`** (Merge):
  - The **Merge** node only has **two** inputs. This workflow uses **two** Merge nodes: (1) **Merge Todoist + Gmail**, (2) **Merge With Calendar** (first merge output + Calendar). Re-import `myassist_unified.json` if the canvas still shows three wires into one Merge.
- Calendar pull empty:
  - verify timezone/day boundaries and calendar ID.
- Todoist 401/403 on pull:
  - verify `TODOIST_API_TOKEN` Variable (raw token only, or with optional `Bearer` prefix — workflow JSON normalizes the header).
  - **403 `Invalid format for Authentication header`:** usually **two** `Authorization` headers (e.g. **Header Auth** credential on the node **and** the expression header). The workflow sets **Authentication = None** and only the expression header; remove **Header Auth** from this node **or** remove the manual header and keep the credential alone.
  - **401:** token missing or wrong — confirm Variable on Pro or credential on Starter; rotate token in Todoist if unsure.
