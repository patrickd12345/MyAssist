# MyAssist Web App

Interactive assistant UI as a unified live window over connected provider systems.

## What this app does

- Shows a structured daily brief from live Gmail, Google Calendar, and Todoist reads.
- Builds the unified Today view in app services and adapters.
- Exposes an interactive assistant through `/api/assistant`.
- Exposes bearer-authenticated MCP routes for the [`myassist-mcp`](../../apps/myassist-mcp/README.md) stdio server: `GET /api/mcp/daily-context`, `GET /api/mcp/action-candidates`, `POST /api/mcp/approve`, `POST /api/mcp/execute`. Configure either legacy `MYASSIST_MCP_TOKEN` + `MYASSIST_MCP_USER_ID` or optional `MYASSIST_MCP_CLIENTS_JSON` / `MYASSIST_MCP_CLIENTS_FILE` for multiple bearer-to-user mappings; optional `MYASSIST_ACTION_APPROVAL_SECRET` for signing approval tokens in production.
- Uses AI gateway in production; local Ollama remains supported for development.
- Uses a light-first visual theme by default, with optional dark/art themes.
- Supports direct Todoist task completion from the dashboard.
- Supports press-and-hold defer actions from the task button.
- Supports AI-drafted task creation with explicit confirmation in the assistant console.
- Avoids autonomous provider writes in v1.
- Silently refreshes live daily context in the background when data is older than a threshold (default 10 minutes), the tab is visible, and at least one integration is connected — see `NEXT_PUBLIC_MYASSIST_AUTO_REFRESH_STALE_MS` in `.env.example`.

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

The dashboard and APIs require a Supabase session. Unauthenticated visitors are redirected to `/sign-in?callbackUrl=%2F`.

**Canonical host:** Set **`NEXT_PUBLIC_SITE_URL`** to the MyAssist public origin (e.g. `https://myassist.bookiji.com`). The client builds Supabase **`emailRedirectTo`** / **`redirectTo`** from this value so magic links and OAuth return to **MyAssist**. Runtime guardrails reject cross-product callback hosts and, on shared Bookiji domains, force auth returns to `https://myassist.bookiji.com` instead of sibling hosts like `app.bookiji.com`.

**Primary:** Email magic link (`signInWithOtp`); completion at `/auth/callback` (PKCE cookie session).

**Also:** Email + password (sign-in / register tabs), plus OAuth — **Continue with Google** / **Continue with Outlook** — all using the same `/auth/callback` return URL.

**Supabase dashboard:** Set **Site URL** to the MyAssist production domain. Enable **Email** (magic link / OTP + password as needed). Under **Redirect URLs**, allow every environment:

- `http://localhost:3000/auth/callback` (local)
- `https://<preview-host>/auth/callback`
- `https://myassist.bookiji.com/auth/callback` (production example)

Without these, magic links and OAuth returns will fail after the provider redirects back.

**Infisical / env:** Supply `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or publishable key alias), plus server-side secrets per your deployment docs.

**`AUTH_SECRET` (or `NEXTAUTH_SECRET`):** In team workflows, keep this in **Infisical** (`/myassist` for local dev) and start with **`pnpm dev:infisical`** (from `apps/web` or repo root). For ad-hoc runs without Infisical, set it in `apps/web/.env.local`.

Optional: set `AUTH_URL` to the public origin (e.g. `http://localhost:3000` locally).

For Vitest and local scripting only, `MYASSIST_AUTH_DISABLED=true` skips login checks (see `vitest.setup.ts`).

Session protection is enforced in server components and API route handlers (no Edge middleware, to avoid bundling issues with Auth.js on Vercel Edge).

## Production (Vercel, e.g. myassist.bookiji.com)

Production smoke checklist: [`docs/MYASSIST_PRODUCTION_SMOKE.md`](../../docs/MYASSIST_PRODUCTION_SMOKE.md).
Production secrets gap runbook: [`docs/MYASSIST_PRODUCTION_SECRETS_RUNBOOK.md`](../../docs/MYASSIST_PRODUCTION_SECRETS_RUNBOOK.md).

You may have **more than one** Vercel project pointing at this repo (e.g. **`web`** vs **`my-assist`**). **Environment variables are per project.** If runtime logs show `MissingSecret` on one hostname but not another, open **Vercel → that project → Settings → Environment Variables** and ensure **`AUTH_SECRET`** (and **`AUTH_URL`**) exist for **Production** (and **Preview** if you use preview URLs).

The Vercel project linked to production should use this app as the deploy root:

- **Git repository:** `patrickd12345/MyAssist`, branch `main`
- **Monorepo root:** leave **Root Directory** empty in the Vercel dashboard (repo root). Deployment config lives in **`vercel.json`** at the repo root: install → `pnpm install`, build → **`pnpm run vercel-build`** (`pnpm --filter web run build`), **output** → **`apps/web/.next`** so Vercel finds the Next.js build output.
- **Next.js detector:** the repo **root** `package.json` lists **`next`** (same version as `apps/web`) so Vercel recognizes the framework while the real app code stays under **`apps/web`**.
- **Production env:** set the exact hosted contract below in Infisical `/platform` + `/myassist` and mirror the same names into the Vercel Production project. Production readiness rejects local-only service URLs such as `localhost` / `127.0.0.1`, requires `AI_MODE=gateway`, and requires `JOB_HUNT_DIGEST_URL` instead of the local `localhost:3847` default. Add the **same** `AUTH_SECRET` (and other secrets) under **Preview** too if you use preview deployments—otherwise `NODE_ENV=production` previews will fail auth at runtime. The CLI has no one-shot “import `.env`” command; use the dashboard **bulk paste** or run `scripts/push-env-to-vercel.ps1` from `apps/web` (see script header). Review keys before pushing—overwrite uses `vercel env add --force`.
- **Custom domain:** assign `myassist.bookiji.com` to this project’s Production deployment in Vercel → Domains.
- **Deployment Protection (Vercel Authentication):** If anonymous hits to `*.vercel.app` return **401** and an HTML **Vercel** login page (not your app), the project has **Vercel Authentication** enabled. The Vercel CLI does not toggle this; use **Project → Settings → Deployment Protection** or `PATCH /v10/projects/{name}` with `{"ssoProtection":null}` and a bearer token. Re-enable protection if you need private previews.
- **OAuth + integration pills on Vercel:** Gmail/Todoist/Calendar tokens are stored in **Supabase** when `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SECRET_KEY` are set; otherwise the app falls back to **`.myassist-memory` on disk**, which **does not persist** on serverless. If OAuth finishes but pills stay “disconnected”, configure Supabase env vars and redeploy. After connect, the dashboard shows a short **OAuth completed** banner and refetches status (query `?integrations=connected` is stripped from the URL).
- **File memory on Vercel:** When `VERCEL` is set, file-backed paths use **`/tmp/myassist-memory`** (writable) instead of `/var/task/.../.myassist-memory`, so **Refresh** and daily context no longer fail with `ENOENT` on `mkdir`. That cache is **ephemeral**; durable memory still needs **Supabase** where the app supports it.

### Required production env names

Infisical/Vercel production must include these names with hosted values:

- `/platform`: `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`, `SHARED_DB_TIER=prod`, `SHARED_DB_ENV_STRICT=1`
- `/myassist`: `AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_SITE_URL`, `MYASSIST_INTEGRATIONS_ENCRYPTION_KEY`, `AI_MODE=gateway`, `VERCEL_AI_BASE_URL` or `AI_GATEWAY_BASE_URL`, `VERCEL_VIRTUAL_KEY` or `AI_GATEWAY_API_KEY` or `OPENAI_API_KEY`, `OPENAI_MODEL` or `AI_GATEWAY_MODEL`, `JOB_HUNT_DIGEST_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TODOIST_CLIENT_ID`, `TODOIST_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`

Optional production names: `RESEND_API_KEY` / `MYASSIST_PASSWORD_RESET_EMAIL_FROM` only for custom Resend password-reset delivery, `BILLING_ENABLED`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `MYASSIST_STRIPE_PRICE_ID` or `STRIPE_PRICE_ID`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `JOB_HUNT_SIGNALS_URL`, `MYASSIST_MCP_TOKEN` / `MYASSIST_MCP_CLIENTS_JSON`, and `MYASSIST_ACTION_APPROVAL_SECRET`.

## Local run

**Default (repo root):** `pnpm dev:all` — runs **this Next app** and **job-hunt digest** together, with **one** Infisical merge (when `apps/web/.infisical.json` + CLI allow) applied to **both** processes. Implementation: `scripts/dev-all.mjs` + `scripts/infisical-merge.mjs` at the repo root.

**Infisical (recommended for team secrets):**

1. Run `infisical init` once from `apps/web` (creates `.infisical.json`; gitignored).
2. In the Infisical project (e.g. `Bookiji Inc`), populate paths **`/platform`** and **`/myassist`** for environment **`dev`** — including **`AUTH_SECRET`**, **`NEXT_PUBLIC_SITE_URL`** and **`AUTH_URL`** (public MyAssist origin; required for correct OAuth / magic link `redirectTo`), Supabase keys, OAuth client ids, and encryption keys as needed.
3. Start everything from the repo root:

   ```sh
   pnpm dev:all
   ```

   Web-only (same Infisical merge behavior, no digest):

   ```sh
   pnpm dev:infisical
   ```

**Curated demo (single command):** sets **`MYASSIST_DEMO_MODE=true`** for the Next process so Today uses the deterministic demo snapshot (no live Gmail/Calendar/Todoist reads). From repo root:

```sh
pnpm demo
```

With Infisical merge first (same rules as `dev:infisical`; demo mode still wins over vault):

```sh
pnpm demo:infisical
```

Implementation: `apps/web/scripts/start-demo.mjs`.

`pnpm dev:infisical` uses the same merge helper and exports `/platform` and `/myassist` before launching `next dev`, so shared Supabase keys and app-specific OAuth/auth keys both arrive even though Infisical CLI path injection is single-folder oriented.

**Reference:** [docs/infisical-and-secrets.md](../docs/infisical-and-secrets.md) — Infisical **paths** (`/platform`, `/myassist`), official **@infisical/mcp** for agents, **CLI** usage, and **`node scripts/sync-env-to-infisical-once.mjs`** (and `--all`) to align the vault with a local `.env.local` on a trusted machine.

Strict verification, without starting Next.js or printing secret values:

```sh
pnpm verify:infisical
pnpm verify:infisical -- --env=prod
```

These commands export `/platform` and `/myassist`, merge them in memory, then run the MyAssist readiness audit. Use them before redeploying BKI-019 login/recovery changes.

**Note:** `pnpm dev` / `npm run web:dev` **without** `dev:infisical` only loads **`apps/web/.env.local`** (and defaults). If `AUTH_SECRET` is empty there, the app still boots in development using the built-in dev fallback, but **production-like checks** and **stable sessions** expect a real secret from Infisical or `.env.local`.

Fallback local path (no Infisical):

1. Copy `apps/web/.env.example` to `apps/web/.env.local`.
2. Configure provider OAuth credentials and optional local model settings (including `AUTH_SECRET`).
3. Start the app from repo root:

   ```sh
   npm run web:dev
   ```

4. Open `http://localhost:3000`.
5. Connect Gmail, Google Calendar, and Todoist from the Integrations section.

If Next.js reports that port **3000** is in use and falls back to **3001+**, stop other dev servers on **3000–3003** so the app binds to **3000**. Google OAuth redirect URIs are registered for `http://localhost:3000/api/integrations/google/callback`; a different port causes `redirect_uri_mismatch` unless that exact origin is added in Google Cloud Console.

## Environment variables

**Infisical is the canonical source for team/shared secrets.** Use `pnpm dev:infisical` for local development, and sync or mirror the same canonical names into Vercel Preview/Production until automated sync is in place. `apps/web/.env.local` is a local fallback only:

- `AUTH_SECRET` (or `NEXTAUTH_SECRET`): secret for Auth.js session cookies (required for `next build` / production; dev-only fallback when unset in development). **Store in Infisical** `/myassist` for normal local dev.
- `MYASSIST_REGISTRATION_INVITE_CODE`: optional; when set, registration must send the same value as `inviteCode` in the JSON body
- `AUTH_URL`: public site URL (recommended; e.g. `http://localhost:3000`)
- `NEXTAUTH_URL`: optional alias for app public URL (used as OAuth redirect base when `AUTH_URL` is unset)
- `MYASSIST_PUBLIC_APP_URL`: optional explicit OAuth redirect base URL fallback
- `MYASSIST_AUTH_DISABLED`: set to `true` only for tests or special local setups (disables auth gates)
- `MYASSIST_DEV_USER_ID`: user id to use when auth is disabled
- `MYASSIST_USER_STORE_FILE`: optional path to the JSON user registry (default: `.myassist-memory/users.json`)
- `MYASSIST_USE_MOCK_CONTEXT`: set to `true` or `1` to serve **mock** daily context instead of live Gmail/Calendar/Todoist reads (useful for UI dev without OAuth)
- `MYASSIST_INTEGRATIONS_ENCRYPTION_KEY`: optional; **if unset**, encryption uses a hash of `AUTH_SECRET` (or a dev fallback). Set an explicit key for production and keep it identical on Vercel and locally if you share one Supabase DB — generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `GOOGLE_CLIENT_ID`: Google OAuth client id for Gmail + Calendar connect flow. Aliases: `MYASSIST_GMAIL_CLIENT_ID`, `MYASSIST_GOOGLE_CLIENT_ID`.
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret for Gmail + Calendar connect flow. Aliases: `MYASSIST_GMAIL_CLIENT_SECRET`, `MYASSIST_GOOGLE_CLIENT_SECRET`.
- `MICROSOFT_CLIENT_ID`: Microsoft / Outlook login OAuth client id for Auth.js. Aliases: `MICROSOFT_ENTRA_ID_CLIENT_ID`, `AUTH_MICROSOFT_ENTRA_ID_ID`, `AZURE_AD_CLIENT_ID`.
- `MICROSOFT_CLIENT_SECRET`: Microsoft / Outlook login OAuth client secret for Auth.js. Aliases: `MICROSOFT_ENTRA_ID_CLIENT_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, `AZURE_AD_CLIENT_SECRET`.
- `MICROSOFT_TENANT_ID`: optional Microsoft Entra tenant id override. Aliases: `MICROSOFT_ENTRA_ID_TENANT_ID`, `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID`, `AZURE_AD_TENANT_ID`.
- `RESEND_API_KEY`: optional Resend API key for custom password-reset email delivery. Supabase Auth handles password-reset email by default. Alias: `MYASSIST_RESEND_API_KEY`.
- `MYASSIST_PASSWORD_RESET_EMAIL_FROM`: optional verified sender for custom MyAssist password-reset email delivery. Aliases: `PASSWORD_RESET_EMAIL_FROM`, `RESEND_FROM_EMAIL`.
- `TODOIST_CLIENT_ID`: Todoist OAuth client id for direct task actions
- `TODOIST_CLIENT_SECRET`: Todoist OAuth client secret
- `AI_MODE`: `ollama` (local dev default), `gateway` (OpenAI-compatible API via `VERCEL_AI_BASE_URL` + key), or `fallback` (deterministic assistant only). Production requires `AI_MODE=gateway`; `ollama` with default `127.0.0.1` is rejected in production readiness/runtime guards. See [`docs/commercial-pilot-readiness.md`](../docs/commercial-pilot-readiness.md).
- `VERCEL_AI_BASE_URL` / `AI_GATEWAY_BASE_URL`, `VERCEL_VIRTUAL_KEY` / `OPENAI_API_KEY`: gateway inference when `AI_MODE=gateway`
- `OLLAMA_BASE_URL`: Ollama base URL, default `http://127.0.0.1:11434`
- `OLLAMA_MODEL`: optional Ollama model name, default `llama3.2:3b`
- `TODOIST_API_TOKEN`: optional global fallback for Todoist REST if the user has not completed Todoist OAuth; dashboard actions need **either** OAuth **or** this token **or** a per-user token in the user registry (see `resolveTodoistApiToken` behavior in code)
- **Billing (optional):** `BILLING_ENABLED=true`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `MYASSIST_STRIPE_PRICE_ID` or `STRIPE_PRICE_ID` (default subscription price when the client does not send `priceId`). Requires hosted Supabase (`SUPABASE_URL` + `SUPABASE_SECRET_KEY`) so `myassist.billing_subscriptions` and `myassist.stripe_event_log` can be written. Canonical webhook: `POST /api/payments/webhook` only. Without `STRIPE_SECRET_KEY`, checkout/portal use **mock URLs** in dev; **production** requires the secret when billing is enabled. Full ops: [`docs/billing-stripe-runbook.md`](../docs/billing-stripe-runbook.md). Run `pnpm run check:env` / `check:env:prod` to validate readiness.

Infisical-first minimum local set:

- `/platform`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SHARED_DB_TIER=dev`, `SHARED_DB_ENV_STRICT=1`
- `/myassist`: `AUTH_SECRET`, `AUTH_URL`, **`NEXT_PUBLIC_SITE_URL`** (public MyAssist origin; OAuth / magic link `redirectTo`), `MYASSIST_INTEGRATIONS_ENCRYPTION_KEY`, `MYASSIST_GMAIL_CLIENT_ID`, `MYASSIST_GMAIL_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, Todoist connect (`TODOIST_CLIENT_ID` / `TODOIST_CLIENT_SECRET` or `MYASSIST_TODOIST_*`), optional custom reset email (`RESEND_API_KEY` / `MYASSIST_PASSWORD_RESET_EMAIL_FROM`), optional `TODOIST_API_TOKEN`, and (for `pnpm dev:all`) job-hunt + Ollama as you use them: `JOB_HUNT_LINKEDIN_RSS_URLS`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_HEADLINE_MODELS`, `OLLAMA_EMAIL_IMPORTANCE_MODELS`

Infisical-first production set uses the required production env names above. Do not store production `AUTH_URL`, `NEXT_PUBLIC_SITE_URL`, `JOB_HUNT_DIGEST_URL`, gateway URLs, or optional service URLs with localhost values.

**Do not** put the following in `/myassist` for the Next app—they are either unused by `apps/web` or belong elsewhere: `MYASSIST_N8N_WEBHOOK_URL` / `MYASSIST_N8N_WEBHOOK_TOKEN` / `MYASSIST_N8N_API_KEY` (n8n is optional tooling; the dashboard does not call these), duplicate `VITE_SUPABASE_*` if `NEXT_PUBLIC_SUPABASE_*` is already set (same values; runtime reads the `NEXT_PUBLIC` / `SUPABASE_*` names), `SUPABASE_ACCESS_TOKEN` (Supabase **CLI** token for `supabase` commands—not the JS client), and `VERCEL_TOKEN` (Vercel **CLI** / API—not Next.js `process.env` at runtime).

The file `apps/web/.infisical.json` is local machine state from `infisical init` and should not be committed.

Notes:

- **Daily context** default path (`GET /api/daily-context`) builds the Today payload from **live** provider APIs unless **`MYASSIST_DEMO_MODE=true`** (curated demo snapshot in `lib/demoDailyContext.ts`, no provider reads; header **`demo`**) or **`MYASSIST_USE_MOCK_CONTEXT=true`** (minimal mock; header **`mock`**). Demo mode takes precedence over mock. The response header `x-myassist-context-source` is **`live`**, **`demo`**, **`mock`**, or **`cache`** (`?source=cache` loads the last written snapshot from disk under `.myassist-memory` — useful for debugging, not a canonical data store). Demo responses are not written to that snapshot cache.
- **Timeouts:** `fetchDailyContextLive` caps each parallel provider leg (Gmail, Calendar, Todoist) at **120s** (`withTimeout` in `lib/fetchDailyContext.ts`); optional daily-intelligence / briefing / good-morning AI summary calls cap at **60s** and skip the AI pass entirely when there is nothing meaningful to summarize. The dashboard uses `dailyContextFetchInit()` (`lib/dailyContextClient.ts`, `AbortSignal.timeout`, **180s**) so Refresh cannot spin forever if the route stalls. `/api/assistant` also caps model calls and falls back cleanly instead of hanging the chat UI. Chat tries the configured Ollama model, then bounded local fallbacks including `tinyllama:latest`; if a local model responds with unusable structured JSON, the route keeps the model metadata and repairs the visible answer with the deterministic assistant reply.
- Provider data is fetched live on demand.
- Writes are sent directly to provider APIs.
- UI state should auto-refresh after successful writes.
- The assistant route falls back gracefully if Ollama is unavailable.
- **Gmail OAuth (Phase B MVP)** uses read-only scopes only (`openid`, `userinfo.email`, `userinfo.profile`, `gmail.readonly`) — see `GMAIL_MVP_OAUTH_SCOPES` in `lib/integrations/providers/google.ts`. **Mark read/unread** in Gmail via API needs `gmail.modify` and returns **422** with `code: insufficient_scope` until a later phase adds that scope. After connecting, **`GET /api/integrations/gmail/verify`** (signed in) lists up to three message ids to confirm API access.
- **BKI-019 login OAuth:** `/sign-in` shows **Continue with Google** and **Continue with Outlook** when `/api/auth/providers` exposes configured Auth.js providers. Register callback URLs exactly as `{AUTH_URL}/api/auth/callback/google` and `{AUTH_URL}/api/auth/callback/microsoft-entra-id`. For production, open **`GET /api/auth/oauth-self-check`** on the same host to confirm the exact non-secret Auth.js callback URLs and provider readiness booleans before updating Google Cloud Console / Microsoft Entra ID.
- **BKI-019 password reset:** production forgot-password requests return generic success and do not expose the reset token. If the account exists and Resend env vars are configured, the reset link is sent by email.
- **Gmail inbox (read-only, bounded):** **`GET /api/integrations/gmail/inbox`** — query params `maxResults` (default 10, hard cap 50), `pageToken` (from prior response), `q` (Gmail search string, length-limited). Returns **`messages`** as **deduplicated canonical rows** (`GmailNormalizedMessage` from `lib/integrations/gmailNormalize.ts`: `messageId`, `threadId`, `internalDate`, `dateHeader`, `from`, `subject`, `snippet`, `labelIds`, `unread`, `important`, `providerAccountId`, `normalizedAt`), plus `nextPageToken` and `queryUsed`. Merge additional pages in-process with `mergeNormalizedGmailPages` to avoid double-counting. Daily-context **`fetchGmailSignals`** uses the same normalize + dedupe path before mapping to legacy `GmailSignal` fields. Raw fetch/list: `lib/integrations/gmailInboxFetch.ts` (fixed 20-message window for signals: `in:inbox newer_than:10d`).
- **Phase B deterministic signals (no LLM):** After normalization, **`detectSignals`** in `lib/integrations/gmailSignalDetection.ts` runs on `GmailNormalizedMessage[]` and attaches **`phase_b_signals`** to each legacy Gmail row when any rule matches (`job_interview`, `job_recruiter`, `job_application`, `job_offer`, `job_rejection`, `job_related`, `important`, `action_required`, `calendar_related`). Each signal includes `messageId`, `type`, `confidence` (0–1 heuristic), `reason`, and optional `extractedDate` / `extractedEntities`. Wired through **`fetchGmailSignals`** → daily context / **`GmailSignal`**.
- **Daily intelligence (`MyAssistDailyContext.daily_intelligence`):** Built in **`lib/dailyIntelligence.ts`** from **`GmailSignal[]`** using **`phase_b_signals`**. Exposes buckets **`urgent`**, **`important`**, **`action_required`**, **`job_related`**, **`calendar_related`**, plus **`summary`** with **`countsByType`**, **`topPriorities`**, and **`generatedDeterministicSummary`**. Urgent = rejection, or (offer + action_required), or (interview + action_required). Optional **`MYASSIST_DAILY_INTEL_AI=true`** adds **`summary.aiSummary`** via **`@bookiji-inc/ai-runtime`** only (`executeChat` in **`aiRuntime.ts`**); if AI is off or fails, deterministic output still ships. The dashboard **`DailyIntelligencePanel`** shows bucket counts, the deterministic summary, optional AI line, and top priorities; **`buildContextDigest`** (`lib/assistant.ts`) adds a compact **`daily_intelligence`** object for the assistant user message via **`lib/dailyIntelligencePrompt.ts`** (no raw inbox dump). **`GET /api/daily-context?provider=gmail`** also returns **`daily_intelligence`** so partial Gmail refreshes stay aligned.
- **Google Calendar intelligence (Phase B):** OAuth for **`google_calendar`** still uses **`https://www.googleapis.com/auth/calendar.events`** so existing MyAssist **calendar write** paths (e.g. email→event) keep working; the **intelligence path only issues GETs** (no new writes in this phase). **`integrationService.fetchCalendarEvents`** loads a **7-day** window (today through day +6, local midnight bounds), **dedupes**, caps merged rows (**`CALENDAR_FETCH_MAX_TOTAL`** in **`lib/calendarPreview.ts`**), and returns raw API items. **`mapGoogleCalendarEventRecord`** maps each row to **`CalendarEvent`** with **`title`**, **`allDay`**, **`attendeesCount`**, **`status`**, **`organizer`**, **`meetingLinkPresent`**, **`source: "google_calendar"`**. **`buildCalendarIntelligence`** (`lib/calendarIntelligence.ts`) emits deterministic signals (**`next_meeting`**, **`meeting_today`**, **`interview_like_event`**, **`scheduling_conflict`**, **`focus_block`**, **`travel_buffer_needed`**, **`calendar_busy_day`**) into **`MyAssistDailyContext.calendar_intelligence`**. The dashboard **`CalendarIntelligencePanel`** and **`buildContextDigest`** (via **`lib/calendarIntelligencePrompt.ts`**) surface a compact summary. **`GET /api/daily-context?provider=google_calendar`** returns **`calendar_intelligence`** alongside **`calendar_today`**.
- **Todoist intelligence (Phase B):** Live read path uses **`fetchTodoistTaskRecordsForUser`** (token from OAuth, per-user token, or `TODOIST_API_TOKEN` fallback via `resolveTodoistApiToken`) and a bounded pull (**3 pages x 100**, hard cap **250 tasks**) from Todoist REST `GET /api/v1/tasks`. Raw rows are normalized to **`TodoistTaskPreview`** (`lib/todoistPreview.ts`) and classified with deterministic rules in **`buildTodoistIntelligence`** (`lib/todoistIntelligence.ts`) for signals: **`overdue_task`**, **`due_today`**, **`high_priority_task`**, **`job_search_task`**, **`follow_up_task`**, **`blocked_task`**, **`task_heavy_day`**. Output is exposed as **`MyAssistDailyContext.todoist_intelligence`**, returned on **`GET /api/daily-context?provider=todoist`**, shown in the Tasks dashboard section, and added compactly to assistant digest context.
- **Unified daily briefing (Phase B final):** **`buildUnifiedDailyBriefing`** (`lib/unifiedDailyBriefing.ts`) composes Gmail + Calendar + Todoist intelligence into one deterministic block at **`MyAssistDailyContext.unified_daily_briefing`** with buckets **`urgent`**, **`important`**, **`action_required`**, **`job_related`**, plus schedule/task/email summaries and counts. Trigger rules prioritize offer/interview actions, interview-day calendar events, overdue high-priority tasks, and schedule conflicts. The payload is included in normal and provider-scoped **`GET /api/daily-context`** responses, surfaced in the dashboard **`UnifiedDailyBriefingPanel`**, and included compactly in assistant context via **`buildContextDigest`**. Optional AI one-line summary uses **`executeChat`** only and always falls back to deterministic output on disable/failure.
- **Good morning message (Phase C):** **`buildGoodMorningMessage`** (`lib/goodMorning.ts`) derives **`MyAssistDailyContext.good_morning_message`** from **`UnifiedDailyBriefing`** (deterministic copy first; optional natural rewrite via **`executeChat`** when **`MYASSIST_DAILY_INTEL_AI=true`**, same fallback rules as the unified briefing AI). The dashboard shows a short **Good morning {firstName}** line plus the message at the top of the Today overview; **`buildContextDigest`** includes **`good_morning_message`** when present.
- **Demo walkthrough (Phase C):** With **`MYASSIST_DEMO_MODE=true`**, use **`getDemoWalkthrough()`** in **`lib/demoScript.ts`** for a fixed presenter script (good morning → briefing → inbox → calendar → tasks → assistant). Fetch JSON at **`GET /api/demo-script`** (no auth; static narrative) for quick checks or docs. Pair with the curated payload from **`getDemoDailyContext()`**.
- Integration statuses and connect links are available in the dashboard header (Gmail, Todoist, Calendar).
- OAuth redirect URIs are built from `AUTH_URL` (then `NEXTAUTH_URL`, then `MYASSIST_PUBLIC_APP_URL`, then request origin). Register the exact callback URL in provider consoles, for example:
  - **Google login via Auth.js:** `http://localhost:3000/api/auth/callback/google`
  - **Microsoft / Outlook login via Auth.js:** `http://localhost:3000/api/auth/callback/microsoft-entra-id`
  - **Google (Gmail + Calendar):** `http://localhost:3000/api/integrations/google/callback` — one URI for both; the signed `state` selects Gmail vs Calendar.
  - **Todoist:** `http://localhost:3000/api/integrations/todoist/callback`

For production `https://myassist.bookiji.com`, the Google OAuth 2.0 Web client used by `GOOGLE_CLIENT_ID` must include both `https://myassist.bookiji.com/api/auth/callback/google` and `https://myassist.bookiji.com/api/integrations/google/callback`, plus authorized JavaScript origin `https://myassist.bookiji.com`. If the OAuth consent screen is in Testing, add `pilotmontreal@gmail.com` as a test user. Microsoft Entra ID must include `https://myassist.bookiji.com/api/auth/callback/microsoft-entra-id` on the app registration matching `MICROSOFT_CLIENT_ID`.

On **Vercel**, set `AUTH_URL` to your real public origin (e.g. `https://your-app.vercel.app`), not `http://localhost:3000`. If those env vars are accidentally left as localhost, `resolvePublicOrigin` ignores localhost in production and uses the request URL instead so OAuth still redirects to the live host.

If Google shows **Error 400: redirect_uri_mismatch**, the `redirect_uri` your app sends does not exactly match one of the **Authorized redirect URIs** on the **same** OAuth 2.0 **Web client** whose **Client ID** is in `GOOGLE_CLIENT_ID` / `MYASSIST_GMAIL_CLIENT_ID` for this deployment. While signed in, open **`GET /api/integrations/oauth-self-check`** on the same host (e.g. `https://myassist.bookiji.com/api/integrations/oauth-self-check`) and copy **`redirectUri`** into Google Cloud Console — character-for-character (including `https` and no trailing slash).

For login OAuth, also open **`GET /api/auth/oauth-self-check`** on the same host (e.g. `https://myassist.bookiji.com/api/auth/oauth-self-check`) and copy **`googleCloudConsole.authorizedRedirectUris`** into Google Cloud Console character-for-character. For signed-in Gmail/Calendar integration OAuth, open **`GET /api/integrations/oauth-self-check`** and copy **`redirectUri`** character-for-character.

## UI variant switch (classic vs refactor)

- MyAssist now supports two co-existing UI variants on the same routes: `classic` (default) and `refactor`.
- Global toggle: bottom-right control in the app shell (`Classic UI` / `Refactor UI`).
- Persistence: `POST /api/ui-variant` with body `{ "variant": "classic" | "refactor" }` writes cookie `myassist_ui_variant` (30 days, `SameSite=Lax`, `secure` in production, `httpOnly=false`).
- Preview override: add `?ui=classic` or `?ui=refactor` to any user-facing route. Query overrides cookie for rendering but does not persist unless you use the toggle/API.
- Rollback: switch back to `Classic UI` using the toggle, or clear/overwrite the `myassist_ui_variant` cookie.

## Validation commands

```sh
npm run web:lint
npm run web:build
```

From `apps/web` (optional env audit without printing secret values):

```sh
pnpm check:env
pnpm check:env:prod
pnpm verify:infisical
pnpm verify:infisical -- --env=prod
```

To evaluate **production-like** checks with vars from `.env.local` (Node 20+), from `apps/web`:

```sh
node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/check-env-readiness.ts --production-like
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
   - `mode: "gateway"` when `AI_MODE=gateway` and keys are set, or
   - `mode: "ollama"` when the local (or remote) Ollama URL is reachable, or
   - `mode: "fallback"` when AI is unavailable or `AI_MODE=fallback`
7. Click `Complete` on a Todoist task and confirm it disappears from the dashboard.
8. Press and hold `Complete` on a Todoist task and confirm a defer menu appears with:
   - `Defer this afternoon` when the current time is morning
   - `Defer tomorrow`
   - `Defer next week`
9. Ask the assistant to create a task, confirm a draft card appears, then click `Create task`.

## Playwright E2E (`pnpm test:e2e`)

- **Looks stuck?** Playwright first **starts** `next dev` on **127.0.0.1:3005** and waits up to **120s** for that URL; then runs specs **one worker** at a time with up to **90s** per test. The quiet stretch is often **Next compiling**, not a freeze. For clearer progress, run **`pnpm test:e2e:verbose`** (`--reporter=line` + `DEBUG=pw:webserver`); from repo root **`pnpm web:test:e2e:verbose`**. (This project’s Playwright `webServer` types only support `pipe` / `ignore` for child stdio, not `inherit`, so we do not stream `next dev` to the same TTY by default.)
- Runs against a dedicated dev server on **127.0.0.1:3005** with **`MYASSIST_USE_MOCK_CONTEXT=true`** (mock Gmail/Todoist/Calendar payload — not production tokens).
- **`workers: 1`**: the Playwright user store file (`tests/e2e/.playwright-users.json`) is shared; parallel workers race and flake registration.
- **`tests/e2e/dashboard-sanity.spec.ts`**: registers a user, checks **`/api/integrations/status`** and **`/api/daily-context`**, then walks **Overview → Tasks → Inbox → Calendar → Assistant** and asserts the Inbox shows mock email copy (e.g. `Example signal (mock)`).
- **`tests/e2e/assistant-ask.spec.ts`**: Assistant tab, fill `#assistant-input`, submit with **Ask**, assert **`POST /api/assistant`** returns **200** and the question text appears in the thread.
- **`tests/e2e/mobile-task-touch-targets.spec.ts`**: Pixel 5 viewport, Tasks tab, first **Complete** button bounding box height **>= 44px**.
- **`tests/e2e/billing-status.spec.ts`**: asserts **`GET /api/billing/status`** and dashboard buttons match billing env. Default (CI): **`enabled: false`**, no subscription buttons. Optional billing-on pass: **`pnpm run test:e2e:billing-ui`** (sets **`PLAYWRIGHT_BILLING_UI=1`**; stop any existing Next on the E2E port first so `reuseExistingServer` picks up env).
- A **connected** integration pill in production only means tokens exist in **`myassist.integration_tokens`**; the **Inbox** tab still depends on a successful **live Gmail read** in **`fetchDailyContextLive`** / daily-context. If Gmail returns no messages or the fetch fails, the Inbox can look empty while status stays connected.

Thorough verification methodology, command outputs, and residual risks: **[`docs/thorough-testing-report.md`](../../docs/thorough-testing-report.md)** and **[`docs/qa-manual-checklist.md`](../../docs/qa-manual-checklist.md)**.
