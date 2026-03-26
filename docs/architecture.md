# MyAssist v1 Architecture

## Current implementation posture

- The active target is a local, single-user product.
- Commercial use is a future possibility, so boundaries should stay clean without absorbing multi-tenant or billing complexity yet.
- The standard for current decisions is:
  - good local UX now
  - stable interfaces later

## Operating modes

- Local mode:
  - local app with direct provider integrations
- Hosted mode:
  - hosted app with the same app-owned OAuth flows
  - target for pilot and commercial reliability

## System boundaries

- Siri:
  - Capture only into Todoist.
  - No planning, classification, or scheduling authority.
- Todoist:
  - Canonical task database.
  - All actionable obligations must end here or be intentionally ignored.
- Gmail:
  - Inbound obligation source.
  - Raw signal, not the planning system.
- Google Calendar:
  - Scheduling context source.
  - Read model, not the planning authority.
- App integration layer:
  - OAuth token management and provider fetches.
  - Executes deterministic transformations and connector reads inside the app.
- Assistant layer:
  - Reasoning and interaction layer in `apps/web`.
  - Reads normalized app context.
  - Uses local Ollama when reachable and deterministic fallback when not.
  - Produces suggestions and conversational guidance; Todoist remains system of record for committed tasks.

## Why Todoist is the source of truth

- Single source avoids drift across tools.
- Deterministic project and priority schema keeps automation predictable.
- Connector and AI failures do not corrupt canonical task state.

## Why Siri is capture only

- Voice capture is high-friction for metadata-heavy task modeling.
- Capture-first, clarify-later preserves speed while avoiding premature structure.

## Why the app owns OAuth and integrations

- OAuth is now handled directly in the app.
- Connector state stays close to the user-facing experience.
- The current product no longer depends on a separate orchestration runtime to fetch core context.

## Why the assistant layer is reasoning only

- AI output can be malformed or uncertain.
- The intended v1 loop is: app integrations fetch context, `apps/web` renders the briefing, and the human confirms and adds tasks in Todoist if needed.
- Auto-create from Gmail to Todoist is out of scope for the shipped repo.

## Trust boundaries

- Trusted:
  - Todoist API token and project mapping.
  - App-managed OAuth credentials for source reads.
  - Deterministic normalization and validation code in the app.
- Semi-trusted:
  - AI classification content and digest prose.
- Untrusted until validated:
  - AI JSON structure and field values.
  - inferred deadlines or ambiguous urgency from email text.

## Workflow boundaries

### Primary: Daily context

- Input: Todoist tasks, Gmail signals, and today calendar events.
- Output: normalized application context only.
- Reasoning and prose: generated in the assistant layer in `apps/web`, optionally using local Ollama.
- Web app (`apps/web`): interactive assistant surface over normalized context; no automatic task writes in v1.
- Non-goal: no autonomous reprioritization writes back to Todoist.

### Dormant automation archive

- Workflow exports under `n8n/` are retained for possible future reuse.
- Docker config and related notes remain archived, not active.

## Failure modes

- Normalized context empty or wrong shape:
  - effect: the assistant lacks usable context
  - mitigation: re-run app fetches and inspect provider integration status
- Missing project IDs:
  - effect: failed Todoist write on explicit action paths
  - mitigation: env and integration setup checklist
- OAuth credential expiry:
  - effect: source pull failure
  - mitigation: reconnect the affected integration
- Calendar timezone mismatch:
  - effect: missing or shifted today events
  - mitigation: verify app timezone settings and provider query window

## Simplifications in v1

- No bidirectional sync across systems.
- No autonomous global reprioritization.
- No persistent analytics store.
- The assistant interprets read-only structured context through local heuristics or Ollama.
- n8n is dormant and not part of the active runtime.

## Assistant execution modes

- `fallback` mode:
  - deterministic rule-based reasoning in `apps/web`
  - always available if context is available
- `ollama` mode:
  - local model-backed reasoning through `/api/assistant`
  - requires Ollama to be reachable from the web app process
- Contract rule:
  - UI renders the same response schema regardless of mode:
    - `answer`
    - `actions`
    - `followUps`
    - `mode`
