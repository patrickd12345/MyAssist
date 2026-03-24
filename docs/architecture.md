# MyAssist v1 Architecture

## Current implementation posture

- The active target is a local, single-user product.
- Commercial use is a future possibility, so boundaries should stay clean, but the repo should not absorb multi-tenant or billing complexity yet.
- The standard for current decisions is:
  - good local UX now
  - stable interfaces later

## Operating modes

- Local mode:
  - local app -> local n8n
- Travel/demo mode:
  - hosted app -> tunnel -> local n8n
  - permitted for personal testing while away from the machine
  - only the webhook surface should be exposed
- Hosted mode:
  - hosted app -> hosted n8n
  - target for pilot/commercial reliability

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
- n8n:
  - Orchestration and automation runtime.
  - Executes deterministic transformations and integrations.
- Assistant layer:
  - Reasoning and interaction layer in `apps/web`.
  - Reads normalized context from n8n.
  - Uses local Ollama when reachable and deterministic fallback when not.
  - Produces suggestions and conversational guidance; Todoist remains system of record for committed tasks.

## Why Todoist is the source of truth

- Single source avoids drift across tools.
- Deterministic project/priority schema keeps automation predictable.
- n8n and AI can fail independently without corrupting canonical task state.

## Why Siri is capture only

- Voice capture is high-friction for metadata-heavy task modeling.
- Capture-first, clarify-later preserves speed while avoiding premature structure.

## Why n8n is orchestration only

- n8n coordinates events and APIs.
- It should not become a long-term task database.
- Persistent dedupe memory is used only as automation guardrail, not business data storage.

## Why the assistant layer is reasoning only

- AI output can be malformed or uncertain; n8n does not write arbitrary tasks to Todoist.
- **Intended v1 loop:** n8n delivers normalized JSON; `apps/web` turns that into an operator-style briefing and interactive assistant experience; the human confirms and adds tasks in Todoist if needed.
- Auto-create from Gmail to Todoist is out of scope for the shipped repo.

## Trust boundaries

- Trusted:
  - Todoist API token and project mapping.
  - n8n deterministic validation code.
  - Google OAuth credentials for source reads.
- Semi-trusted:
  - AI classification content and digest prose.
- Untrusted until validated:
  - AI JSON structure and field values.
  - inferred deadlines or ambiguous urgency from email text.

## Workflow boundaries

### Primary: Daily context (Cron)

- Input: Todoist tasks + Gmail signals + today calendar events.
- n8n output: **normalized JSON** only.
- Triggers: **Cron** (scheduled) and **Webhook** (on-demand GET for the web app).
- Reasoning and prose: generated in the assistant layer in `apps/web`, optionally using local Ollama.
- **Web app (`apps/web`):** interactive assistant surface over the normalized context; no task writes in v1.
- **No** automatic Todoist task creation from this path.
- Non-goal: no autonomous reprioritization writes back to Todoist.

### Optional Gmail -> Todoist (not in repo)

- Not part of default v1; tasks are created **in chat** or manually in Todoist.
- A future automation could be rebuilt from `prompts/email_triage_prompt.txt` if needed.

## Failure modes

- Normalize output empty or wrong shape:
  - effect: Custom GPT lacks usable context
  - mitigation: re-run workflow; check Todoist/Gmail/Calendar nodes and **Normalize Aggregated Data** inputs
- Missing project IDs (only if a custom Gmail->Todoist automation is added later):
  - effect: failed Todoist write on that path
  - mitigation: Variables and README setup checklist
- OAuth credential expiry:
  - effect: source pull failure in digest workflow
  - mitigation: re-auth and credential monitoring
- Calendar timezone mismatch:
  - effect: missing/shifted today events
  - mitigation: verify n8n instance timezone and node time window

## Simplifications in v1

- No bidirectional sync across systems.
- No autonomous global reprioritization.
- No persistent analytics store.
- Gmail signal defaults to starred/recent query for maintainability.
- n8n emits read-only structured context; the assistant layer interprets it through local heuristics or Ollama.

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
