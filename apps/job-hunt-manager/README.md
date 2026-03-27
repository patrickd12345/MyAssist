# job-hunt-manager

MCP server for MyAssist: aggregates job listings (RSS and compliant feeds), normalizes to a single schema, supports **tracks** (`ai_focus`, `sap_bridge`, user-defined **New track**), and persists per-posting lifecycle (transcripts, touchpoints, signing probability).

## Run (stdio MCP)

From repo root:

```bash
npm --prefix apps/job-hunt-manager run dev
```

Cursor: merge the block from repo root [`tools/cursor-mcp-job-hunt-manager.example.json`](../../tools/cursor-mcp-job-hunt-manager.example.json) into the user MCP config (Windows: `%USERPROFILE%\.cursor\mcp.json`). Set `cwd` to the **absolute** path of `apps/job-hunt-manager` in this repo. Keep `args` as shown (`node_modules/tsx/...` and `src/server.ts` are relative to `cwd`).

Claude Desktop / manual: `command` = `node`, `args` = full path to `node_modules/tsx/dist/cli.mjs` then `src/server.ts`, `cwd` = `apps/job-hunt-manager` (absolute recommended).

## Digest HTTP (local MCP companion)

```bash
npm --prefix apps/job-hunt-manager run digest:dev
```

The **MyAssist web app** does not require this server for the Today view; it uses live Gmail/Calendar/Todoist and posts email **signals** to job-hunt-manager when configured (`JOB_HUNT_SIGNALS_URL` / defaults). The digest server is useful for **MCP**, local tooling, and Job Hunt UI features that call the HTTP API.

- `GET http://127.0.0.1:3847/digest` — JSON summary by track and follow-up counts.
- `POST http://127.0.0.1:3847/signals` — body `{ "signals": [ { "from", "subject", "snippet", "date", "id?", "threadId?" } ] }`. Heuristic match to saved leads; logs incoming email touchpoints and may advance lifecycle. Response: `{ "processed", "matches" }`.
- `POST http://127.0.0.1:3847/save-job` — body `{ "id": "<job id from search>", "track"?: "ai_focus", "notes"?: "..." }` **or** `{ "id", "new_track": { "label": "...", ... }, "notes"?: "..." }` (creates a user track; omit `track`). The job id must exist in the digest index (from `GET /jobs` / search, or from `GET /resolve-job?...&fetch=1` for LinkedIn). Response: `{ "ok": true, "saved" }` or `400` with `error`.
- `GET http://127.0.0.1:3847/resolve-job?q=...` — search the cached job index by full id, LinkedIn numeric id (`/view/...` or `currentJobId=`), or URL substring. Response: `{ "ok", "query", "candidates", "fetched", "fetch_not_linkedin" }`. With **`fetch=1`** (or `fetch=true`) and optional **`track=ai_focus`** (default), if there is no cache hit the server tries to **fetch the public LinkedIn job view page** (HTML), parse JSON-LD / `og:title`, merge into the index, and return that job. `fetched` is true when a job was loaded from the network this request; `fetch_not_linkedin` is true when `fetch` was set but the query could not be turned into a LinkedIn view URL (online fetch is LinkedIn-only for now). Fragile if LinkedIn blocks or changes markup.
- `GET http://127.0.0.1:3847/saved-jobs` — optional query `track`, `status` (lifecycle stage). Response: `{ "ok": true, "jobs": [ { saved, job, lifecycle, touchpoints } ] }`.
- Env: `JOB_HUNT_DIGEST_PORT`, `JOB_HUNT_DATA_PATH`.

**Email and calendar tagging:** To force a Gmail signal to a specific saved lead, put the bracket token **`[MA-JOB:<job_id>]`** in the subject (case-insensitive on `MA-JOB`; the id is the unified job id shown in the web UI). That match wins before heuristics. The same token in a calendar event **title or location** (as surfaced in daily context) lets the Job Hunt UI filter today's events for that lead.

## Data

Default store: `~/.job-hunt-manager/store.json` or `JOB_HUNT_DATA_PATH`. Reads and writes are async and guarded with a file lock (`store.json.lock`) so concurrent MCP/digest processes do not corrupt JSON.

## RSS / compliant sources

Set any of (comma- or newline-separated URLs) in the **environment** of the process running `job-hunt-manager` (MCP or digest server):

- `JOB_HUNT_RSS_FEEDS`
- `JOB_HUNT_LINKEDIN_RSS_URLS`
- `JOB_HUNT_INDEED_RSS_URLS`
- `JOB_HUNT_WORKOPOLIS_RSS_URLS`
- `JOB_HUNT_COMPANY_RSS_URLS`

**LinkedIn:** Public job **RSS** URLs usually return **404** today. The connector instead treats each `JOB_HUNT_LINKEDIN_RSS_URLS` entry as a **normal LinkedIn job search URL** (including the old `.../jobs/search/rss?keywords=...&location=...` form) and pulls listings via LinkedIn’s **guest job search API** (HTML cards). Optional: `JOB_HUNT_LINKEDIN_GUEST_MAX_PAGES` (default `5`) caps pagination.

**App-managed overrides:** the MyAssist web app (`/job-hunt`) can write **`rss-sources.json`** (same merge rules: file wins per key when that key is present). Default path: next to the store file, or set **`JOB_HUNT_RSS_SOURCES_FILE`**.

**Local dev:** `digest-server` and the MCP `server` load **`apps/web/.env.local`** when that file exists (monorepo layout), so `JOB_HUNT_*` values set there apply to digest and MCP without duplicating env in another shell.

**MyAssist web (`/job-hunt`):** With **Use custom list** enabled for LinkedIn, the textarea URLs are written to `rss-sources.json` and are the same URLs `fetchLinkedInJobs` uses—no separate “RSS XML” path for LinkedIn.

**Listing order:** `GET /jobs` on the digest server defaults to `sort=feed` (connector order: LinkedIn guest API page order). MCP `search_jobs` defaults to `sort=relevance` (track keyword ranking). Use `sort: "feed"` in MCP to match the web list. Guest HTML may still differ from a **signed-in** LinkedIn tab.

Optional: `JOB_HUNT_LOOPCV_ENABLED=true` (placeholder until official API wiring).

Demo listings when no feeds are configured:

- `JOB_HUNT_DEMO_JOBS=true`

## Tools

`search_jobs`, `get_job`, `save_job` ( `track` or `new_track` ), `list_tracks`, `create_track`, `archive_track`, `mark_applied`, `list_saved_jobs`, `update_job_progress`, `add_interview_transcript`, `log_touchpoint`, `score_signing_probability`.
