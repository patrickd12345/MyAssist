# MyAssist n8n workflow troubleshooting

> **Dormant / historical (n8n)**  
> The **MyAssist web app** does **not** use n8n webhooks for daily context. **Today** is built from **live** Gmail, Google Calendar, and Todoist via in-app OAuth. The content below describes the **preserved** workflow under `n8n/` for optional self-hosted use or archaeology — **not** current product setup. See [n8n-dormant.md](./n8n-dormant.md).

---

End-to-end flow (in the preserved workflow design): **Webhook or Cron** triggers three parallel nodes (**Todoist HTTP**, **Gmail**, **Google Calendar**), two **Merge (Append)** nodes fan in, then **Normalize Aggregated Data** returns JSON comparable to the app's context shape.

## Live n8n vs repo (MCP snapshot)

Verified via **n8n MCP** against workflow **MyAssist - Daily Context (normalized JSON)** (active).

| Topic | What is running in n8n (live) | Repo `n8n/myassist_unified.json` |
|--------|-------------------------------|-------------------------------------|
| Gmail filter `q` | **`label:starred newer_than:7d`** | **`newer_than:14d`** (no starred requirement) |
| Google Calendar | **`options` only has `orderBy`** (no explicit `timeMin` / `timeMax` in the exported graph) | **`America/Toronto`** start/end of day |
| Normalize Code | **`$items(..., 0, 0)`** inline, no `source_item_counts` | **`$items(nodeName)`**, Toronto `run_date`, **`source_item_counts`** |
| Triggers | **Cron only** in the published graph (no **Webhook** node in this export) | **Webhook + Cron** |
| Todoist auth | **Hardcoded `Bearer` token in the HTTP Request node** | **`$vars.TODOIST_API_TOKEN`** expression |

**Manual execution (sample):** Gmail node **0** items, Calendar node **1** item, normalized `gmail_signals` length **0**, `calendar_today` length **1**. Empty Gmail matches the **starred-only** query when there are no starred messages in the window.

**Security:** If the Todoist token ever appeared in exports, chat, or MCP output, **rotate it in Todoist** and switch the node to **variables or credentials** so the token is not stored in workflow JSON.

**MCP limits:** The official n8n MCP can **search**, **get details**, **execute**, and **get execution**; it does **not** push node edits. Align live n8n by **importing** the repo JSON or **editing** the Gmail / Calendar / Code / Webhook nodes in the UI, then **publish**.

## 1. Confirm what the workflow actually returned

Open the latest **execution** in n8n. Check each node:

| Node | Green with items? | If red / empty |
|------|-------------------|----------------|
| Todoist - Get Active Tasks | One item whose JSON is the task array | `$vars.TODOIST_API_TOKEN` missing or invalid |
| Gmail - Get Starred Signals | N items (messages) | OAuth, API not enabled, or query matches nothing (see below) |
| Google Calendar - Today Events | N items (events) | OAuth, wrong calendar ID, or no events **today** in that calendar + timezone window |

The **Normalize** output now includes **`source_item_counts`**: `todoist_http_items`, `gmail_messages`, `calendar_events`. If counts are `0` for Gmail or Calendar while the nodes are green, the upstream node returned no rows. If Normalize shows counts but arrays are empty, report a bug in the mapper.

## 2. Gmail is empty

**Credentials**

- Gmail node must use **Google OAuth2** with **Gmail API** enabled in Google Cloud.
- OAuth consent: if the app is in **Testing**, the mailbox must be a **test user**.
- See [n8n-google-oauth.md](./n8n-google-oauth.md) for redirect URI and `redirect_uri_mismatch`.

**Query**

- The workflow uses **`newer_than:14d`** (recent mail), **not** starred-only. An older copy used `label:starred`; that returns **no rows** if nothing is starred. Re-import [n8n/myassist_unified.json](../n8n/myassist_unified.json) or set the Gmail filter `q` to `newer_than:14d`.

**Execution errors**

- If Gmail **fails**, the run usually stops unless **Continue On Fail** is on. Fix the error on the Gmail node first.

## 3. Calendar is empty

**Today window**

- Events are loaded for **start/end of day in `America/Toronto`** (same idea as Montreal/Eastern). If the n8n instance used only UTC `$now`, events could fall on the wrong calendar day; the workflow file now uses `setZone('America/Toronto')` for both the Calendar node and `run_date`.

**Calendar ID**

- The node targets **`pilotmontreal@gmail.com`**. Events on **other calendars** (Work, shared) do not appear unless that calendar is selected or you add another branch.

**No meetings today**

- An empty list can be correct if there are no events on that calendar for that local day.

## 4. Normalize Code node and `$items`

The Code node reads sibling outputs with **`$items('Node Name')`** (all items). Using **`$items(name, 0, 0)`** in older snippets could mis-read items in some n8n versions. The repo normalize step uses **`$items(nodeName)`** only.

## 5. Merge nodes

- **Append** mode needs **both** inputs to complete. If one branch errors, the merge may not run. Use [n8n-local-merge-version.md](./n8n-local-merge-version.md) if Merge nodes show `?` or `execute` errors (wrong `typeVersion`).

## 6. “Data looks empty” — app vs preserved workflow

**MyAssist web app (current runtime):** Today/full context come from **live** provider reads (Gmail, Google Calendar, Todoist OAuth) or **mock** / **cache** for dev (`x-myassist-context-source`, optional `MYASSIST_USE_MOCK_CONTEXT`). There is **no** production path that requires n8n or **`MYASSIST_N8N_WEBHOOK_URL`** for the UI.

**If you are only running the preserved n8n graph** (optional / historical): an HTTP **Webhook** node must expose a URL your client can call; the repo’s optional `tools/webhook-proxy.mjs` forwards to **`MYASSIST_N8N_WEBHOOK_TARGET`** (default `http://localhost:5678/webhook/...`); see that script for optional **`MYASSIST_TUNNEL_*`** vars. Comparing payloads: normalized n8n output should be *comparable in shape* to the app’s provider-backed context, but the app does **not** call that webhook in the default stack.

- **`Copy payload`** in the app reflects **live / mock / cache** — not necessarily the same execution as a local n8n run unless you have built a custom bridge (out of scope for default setup).

## 7. Re-import workflow

From repo root:

```sh
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('n8n/myassist_unified.json','utf8'));fs.writeFileSync('n8n/myassist_unified.import.json',JSON.stringify([j],null,2));"
npx n8n import:workflow --input n8n/myassist_unified.import.json
```

Then attach credentials, set **Todoist** token in variables if used, **activate** the workflow, and test the webhook URL.
