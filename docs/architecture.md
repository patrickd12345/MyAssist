# MyAssist v1 Architecture

## Product model

MyAssist is a unified live control panel and integrated live operational window over:

- Gmail
- Google Calendar
- Todoist

MyAssist is not a sync engine and not a local mirror of provider data.

## Source-of-truth boundaries

- Gmail owns email records.
- Google Calendar owns event records.
- Todoist owns task records.
- MyAssist does not own canonical copies of provider emails/events/tasks.

## What MyAssist stores

MyAssist may store only:

- OAuth and account connection state
- user preferences
- app memory
- lightweight internal metadata
- action logs
- cross-system linkage metadata when needed

MyAssist does not store provider mirror tables and does not run reconciliation pipelines.

## Runtime interaction model

- Read path:
  - fetch provider data live on demand through provider adapters
  - compose a unified Today view in app services
- Write path:
  - execute direct actions against provider APIs
  - refresh affected UI state automatically after successful write
- Manual refresh:
  - keep available only as hidden/debug fallback
  - not the primary UX model

## Daily context and source model

- **Full daily context** is assembled in the app from **unified live reads** of Gmail, Google Calendar, and Todoist. MyAssist does not run a sync engine and does not treat a workflow orchestrator as the source of truth for Today.
- **Source values** (also exposed as the `x-myassist-context-source` header on `GET /api/daily-context`):
  - **`live`**: current provider-backed snapshot from the default refresh path.
  - **`mock`**: demo payload when `MYASSIST_USE_MOCK_CONTEXT` is enabled (development/demo only by convention).
  - **`cache`**: last persisted snapshot when the client requests `?source=cache` (debug / fast replay path — still not a provider mirror).

## Job Hunt intelligence (web lane)

- **Inputs:** Gmail signals from the same live read path used for Today (no separate mirror table for email bodies).
- **Detection:** Heuristic classification (e.g. interview, application confirmation, outreach, offer, rejection) with guarded precision rules; **normalized identity** (company, role, recruiter) with sanitization and **identity suppression** when an item is treated as non-job with zero confidence.
- **Stages:** Deterministic stage hints from signal precedence (single ordered mapping).
- **Cross-system actions:** User-triggered actions (prep tasks, calendar blocks, Todoist, etc.) go through provider APIs; the app tracks **dedupe metadata** and surfaces **reused target** summaries in the UI when an action is skipped as already done.
- **Saved-job matching:** The **job-hunt-manager** service (HTTP `POST /signals`) scores email against saved leads; **equal-score ties** resolve with a **deterministic** ordering (thread match, role/subject overlap, stable job id).

## Hosted beta / production checklist

For deploying the same app off `localhost` (durable accounts, OAuth, monitoring), see [commercial-pilot-readiness.md](./commercial-pilot-readiness.md).

## Authentication (Supabase)

- End users sign in via **Supabase Auth**; the app route **`/auth/callback`** exchanges the PKCE `code`, sets session cookies, then calls **`ensureAppUser`** once to bridge `auth.users` → **`myassist.app_users`** (no hidden writes in generic session helpers).
- Error codes, redirect policy, and operational notes: [auth-supabase-callback.md](./auth-supabase-callback.md).

## Database (Bookiji shared Supabase)

On the shared Bookiji Inc database, product data is segregated by schema: `platform.*` (cross-product spine), `bookiji.*`, `kinetix.*`, `chess.*`, and **`myassist.*`** for this app’s durable tables (`app_users`, `integration_tokens`). The legacy `public.*` namespace is avoided for new product tables. Post-migration verification SQL and rollout notes: [myassist-schema-segregation-readiness.md](./myassist-schema-segregation-readiness.md).

## Historical orchestration (dormant n8n)

- Exported workflows under `n8n/` and related notes in `docs/n8n-*.md` are **preserved** for reference or optional future reactivation. They are **not** part of the active runtime for daily context. See [n8n-dormant.md](./n8n-dormant.md).

## Recommended module boundaries

- `gmailAdapter`
  - live Gmail reads and direct Gmail writes
- `calendarAdapter`
  - live Calendar reads and direct Calendar writes where applicable
- `todoistAdapter`
  - live Todoist reads and direct Todoist writes
- `unifiedTodayService`
  - composes live provider reads into one operational Today payload
- `crossSystemActionService`
  - executes cross-system user actions and emits lightweight action logs/metadata

These boundaries must not evolve into mirror-table ownership or full sync workers in v1.

## Trust boundaries

- Trusted:
  - app-managed OAuth credentials
  - deterministic provider adapter code
  - validation and transformation code
- Semi-trusted:
  - AI-generated summaries or rankings
- Untrusted until validated:
  - inferred intent and malformed AI output

## Simplifications in v1

- No provider-data mirror tables.
- No bidirectional reconciliation pipelines.
- No autonomous cross-system sync workers.
- No local canonical store for emails/events/tasks.

## Assistant execution modes

- `fallback` mode:
  - deterministic reasoning in `apps/web`
- `ollama` mode:
  - local model-backed reasoning through `/api/assistant`
- Contract rule:
  - UI renders the same schema regardless of mode:
    - `answer`
    - `actions`
    - `followUps`
    - `mode`
