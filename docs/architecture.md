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
