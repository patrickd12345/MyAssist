# MyAssist v1

Personal operations system centered on Todoist, Gmail, Google Calendar, and a local-first assistant UI.

## What this includes

- `apps/web/`: Next.js assistant surface. Renders an operator-style briefing and exposes an interactive assistant console with local Ollama when available and deterministic fallback when not.
- OAuth-first integration layer now handles encrypted token storage and per-provider connect flows in-app for Gmail, Todoist, and Google Calendar through `/api/integrations/*`.
- `n8n/`: preserved workflow exports and related assets. These files remain in the repo but the runtime is currently dormant.
- `prompts/email_triage_prompt.txt`: optional reference if a future automation path is rebuilt.
- `prompts/daily_digest_prompt.txt`: legacy reference from an earlier digest path.
- `.env.example`: required variables and safe defaults.
- `docs/architecture.md`: current system boundaries and failure modes.
- `docs/n8n-dormant.md`: dormant status and re-enable instructions for n8n.
- `PROJECT_TRACKER.md`: live execution tracker for the local-first build.

## Tooling preference

- Default command examples use `npm`.
- Preferred local runtime:
  - `apps/web` on `npm`

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
  - local PC execution is acceptable while connectors and payload contracts are still changing
- Travel/demo:
  - the Vercel app can run against app-owned OAuth integrations rather than a local automation runtime
- Pilot and commercial:
  - run `apps/web` on Vercel
  - keep orchestration optional until it is needed again

## Migration-safe rule

- Keep workflow exports under `n8n/` unchanged while dormant.
- Keep secrets in env vars or app-managed OAuth storage.
- Treat n8n as an optional future runtime, not an active dependency.

## Operating modes

- Local mode:
  - local app with direct OAuth-backed integrations
- Hosted mode:
  - hosted app with the same app-owned OAuth flows

## v1 operating rules

- Todoist is the single source of truth.
- Siri is capture only.
- The assistant layer is reasoning only.
- No bidirectional sync in v1.
- No autonomous global reprioritization in v1.
- Default v1: no automated Todoist writes from Gmail.

## Web app (interactive assistant)

Purpose:

- Render an operator-style daily brief over live integrated context.
- Let you ask questions against the current snapshot.
- Return answers, suggested actions, and follow-up prompts.

Setup:

1. In `apps/web`, copy `apps/web/.env.example` to `apps/web/.env.local`.
2. Configure the app integrations and optional local model settings.
3. From repo root run `npm run web:dev`.
4. Open `http://localhost:3000`.

Assistant behavior:

- The homepage includes a live assistant console.
- Questions are answered against the current app-fetched context snapshot.
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

- `GET /api/daily-context` should return normalized app data.
- `POST /api/assistant` should return JSON with `mode`, `answer`, `actions`, and `followUps`.
- `mode=ollama` means the local model is active.
- `mode=fallback` means the assistant is running on built-in heuristics.

## Dormant automation

n8n is currently dormant because OAuth is now handled in the app. Workflow JSON exports, credentials examples, docker config, and backups remain in the repo for possible future reactivation. See `docs/n8n-dormant.md`.

## Required accounts and credentials

- Google account with Gmail and Google Calendar access
- Todoist account with API token
- Optional local Ollama runtime for model-backed assistant answers

## Commercial guardrail

Build the local single-user product first. Keep boundaries stable so future auth, billing, BYOK, and optional orchestration can be added without rewriting the core app.
