# MyAssist v1

Personal operations system as a unified live operational window over Gmail, Google Calendar, and Todoist.

## What this includes

- `apps/web/`: Next.js assistant surface with a unified live Today view and direct provider actions.
- OAuth integration layer for Gmail, Google Calendar, and Todoist through `/api/integrations/*`.
- local app memory and lightweight metadata in `.myassist-memory`.
- `docs/architecture.md`: provider-canonical boundaries and module layout.
- `docs/commercial-pilot-readiness.md`: hosted deployment checklist (Supabase storage, Sentry, env vars).
- `docs/myassist-operational-signoff.md`: pilot sign-off for live AI path, live Today after OAuth, adapter boundaries.
- `apps/web`: `pnpm check:env` / `pnpm check:env:prod` — env readiness report (no secret values printed).
- `PROJECT_TRACKER.md`: execution tracker aligned to the live-window model.

## Tooling preference

- Default command examples use `npm`.
- Preferred local runtime:
  - `apps/web` on `npm`

## Operating model

- Providers remain canonical:
  - Gmail owns emails
  - Google Calendar owns events
  - Todoist owns tasks
- MyAssist stores only:
  - OAuth/account connection state
  - user preferences
  - app memory
  - lightweight internal metadata
  - action logs
  - cross-system linkage metadata when needed
- No provider-data mirror tables.
- No bidirectional reconciliation pipelines.

## Operating modes

- Local mode:
  - local app with direct OAuth-backed integrations
- Hosted mode:
  - hosted app with the same app-owned OAuth flows

## v1 operating rules

- Siri is capture only.
- The assistant layer is reasoning only.
- No sync engine behavior in v1.
- No autonomous global reprioritization in v1.
- Live fetch on demand for provider reads.
- Direct provider API writes for actions.
- UI state auto-refresh after writes.
- Manual refresh is debug fallback, not core UX.

## Web app (interactive assistant)

Purpose:

- Render a unified live control panel over connected systems.
- Let you ask questions against the current snapshot.
- Return answers, suggested actions, and follow-up prompts.

Setup:

1. **One command (repo root):** `pnpm dev:all` — starts **Next** (`apps/web`) and the **job-hunt digest** dev server, with **optional** Infisical merge (`/platform` + `/myassist`) when `apps/web/.infisical.json` exists and the CLI works; otherwise it falls back to `apps/web/.env.local` and existing env. See `scripts/dev-all.mjs` and `scripts/infisical-merge.mjs`.
2. **Secrets (recommended):** [Infisical](https://infisical.com) — run `infisical init` once from `apps/web`, then store keys under `/platform` and `/myassist` for env `dev`. Details: `apps/web/README.md`.
3. **Without Infisical:** Copy `apps/web/.env.example` to `apps/web/.env.local` and fill values.
4. Configure OAuth for Gmail, Google Calendar, and Todoist when needed (`apps/web/README.md`). Optional: `MYASSIST_USE_MOCK_CONTEXT=true`, Ollama, etc.
5. Open `http://localhost:3000` after `pnpm dev:all` is running.

Assistant behavior:

- The homepage includes a live assistant console.
- Questions are answered against the current live-fetched context.
- If Ollama is reachable, replies come from the local model.
- If Ollama is not reachable, the assistant falls back to deterministic reasoning so the app still works.
- Todoist tasks can be completed explicitly from the dashboard when configured.
- Todoist tasks can also be deferred from the same button by press-and-hold, using explicit schedule options.
- The assistant can draft new Todoist tasks, but the write still requires explicit user confirmation.
- In the Inbox tab, `Handled` now attempts direct Gmail OAuth write-back first.
- Assistant responses include:
  - `answer`
  - `actions`
  - `followUps`
  - `mode`

Verification:

- `GET /api/daily-context` should return normalized app data built from **live** Gmail, Google Calendar, and Todoist reads (providers are canonical — not a local mirror of mail/events/tasks).
- The response may include header `x-myassist-context-source` with value **`live`** (default refresh), **`mock`** (when `MYASSIST_USE_MOCK_CONTEXT` is enabled in `apps/web/.env.local`), or **`cache`** (when using `GET /api/daily-context?source=cache` for the last saved snapshot).
- `POST /api/assistant` should return JSON with `mode`, `answer`, `actions`, and `followUps`.
- `mode=ollama` means the local model is active.
- `mode=fallback` means the assistant is running on built-in heuristics.

## Required accounts and credentials

- Google account with Gmail and Google Calendar access
- Todoist account with API token
- Optional local Ollama runtime for model-backed assistant answers

## Commercial guardrail

Build the local single-user product first. Keep boundaries stable so future auth, billing, BYOK, and optional orchestration can be added without rewriting the core app.
