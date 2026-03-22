# MyAssist v1 Architecture

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
- ChatGPT:
  - Reasoning layer and **interactive planning** (what to do, how to word tasks).
  - **Canonical task creation for obligations is manual or chat-driven**, not automated from Gmail in v1.
  - Produces suggestions; Todoist remains system of record for committed tasks.

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

## Why ChatGPT is reasoning (and optional task drafting)

- AI output can be malformed or uncertain; n8n does not write arbitrary tasks to Todoist.
- **Intended v1 loop:** n8n delivers **normalized JSON**; the **Custom GPT** and the optional **read-only web app** are two UIs over the same fact layer; the Custom GPT helps decide next actions and task wording; **the human confirms** and adds tasks in Todoist (paste, Siri, or a future Action / API bridge if added later).
- Auto-create from Gmail to Todoist is **out of scope** for the shipped repo (no second workflow JSON); **not** required for the ChatGPT-first intent.

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
- n8n output: **normalized JSON** only (terminal node: **Normalize Aggregated Data**).
- Triggers: **Cron** (scheduled) and **Webhook** (on-demand GET for the web app).
- Reasoning and prose: **Custom GPT (MyAssist Operator)** in ChatGPT, not inside n8n.
- **Web app (`apps/web`):** read-only display + copy JSON; does not replace Todoist or the Custom GPT; no task writes in v1.
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
- n8n emits read-only structured context; briefing prose is produced in ChatGPT.
