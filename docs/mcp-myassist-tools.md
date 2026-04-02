# MyAssist MCP tools (schema-first)

This document describes the MCP tool surface for the **myassist-mcp** stdio server and how it maps to the web API.

## Implemented (v0.2)

| Tool | HTTP equivalent | Notes |
| --- | --- | --- |
| `get_daily_context` | `GET /api/mcp/daily-context` | Bearer `MYASSIST_MCP_TOKEN`; read-only |
| `list_action_candidates` | `GET /api/mcp/action-candidates` | Bearer; read-only; lists `complete_task` (Todoist overdue + due today) and `email_to_task` (current `gmail_signals` rows with a message id) |
| `approve_action` | `POST /api/mcp/approve` | Bearer; body `{ "action_id" }`; returns `approval_token` + `expires_at` |
| `execute_action` | `POST /api/mcp/execute` | Bearer; body `{ "action_id", "approval_token" }`; runs `complete_task` or `email_to_task` per `action_id` |

Write tools require a **two-step flow**: list candidates, then **human confirmation in the host**, then `approve_action`, then `execute_action`. Do not skip approval for destructive operations.

## Security

- **Single-user (legacy):** `MYASSIST_MCP_TOKEN` plus `MYASSIST_MCP_USER_ID` on the web app — long random secret; user id is server-side only.
- **Multi-client (optional):** `MYASSIST_MCP_CLIENTS_JSON` (JSON array of `{ "bearerToken", "userId" }`) or `MYASSIST_MCP_CLIENTS_FILE` (path to the same JSON). When this list is non-empty, the bearer must match an entry; legacy token/user env vars are not used. Set `MYASSIST_ACTION_APPROVAL_SECRET` in production when using client lists without `MYASSIST_MCP_TOKEN`, or rely on the derived secret from the JSON/file contents.
- **Approval signing:** The web app signs approval tokens with `MYASSIST_ACTION_APPROVAL_SECRET` when set; otherwise it derives from `MYASSIST_MCP_TOKEN`, then from client-list config material, then fails if none apply.
- Stateless tokens can be replayed until they expire; use a short TTL (default 10 minutes) and treat the host as responsible for not reusing tokens carelessly.
- Data sent to third-party MCP hosts follows their retention policies; see [docs/owasp-llm-myassist.md](owasp-llm-myassist.md).

## Tool: `get_daily_context`

### Input

See [`schemas/get_daily_context.input.json`](schemas/get_daily_context.input.json).

Optional fields `date` and `timezone` are accepted by the MCP tool for forward compatibility; the web route may ignore them until a dedicated scheduling API exists.

### Output

The JSON body matches a successful `GET /api/daily-context` response: **`MyAssistDailyContext`** (see [`apps/web/lib/types.ts`](../apps/web/lib/types.ts)).

A high-level outline is in [`schemas/get_daily_context.output.schema.json`](schemas/get_daily_context.output.schema.json). For authoritative field types, prefer TypeScript types and OpenAPI generation from the repo if added later.

## Tool: `list_action_candidates`

### Input

Empty object (no required fields).

### Output

See [`schemas/list_action_candidates.output.schema.json`](schemas/list_action_candidates.output.schema.json). Shape:

- `generated_at` — string (ISO)
- `candidates` — array of `{ action_id, label, kind, metadata? }`

## Tool: `approve_action`

### Input

See [`schemas/approve_action.input.json`](schemas/approve_action.input.json).

### Output

```json
{
  "approval_token": "<opaque>",
  "expires_at": "<ISO8601>"
}
```

The `action_id` must appear in the **current** candidate list built from live daily context (same rules as `list_action_candidates`).

## Tool: `execute_action`

### Input

See [`schemas/execute_action.input.json`](schemas/execute_action.input.json).

### Output

JSON body matches `CrossSystemActionResult` from the cross-system action service (`complete_task` or `email_to_task`, success or structured error).

## Ops

- **Monday.com:** When shipping MCP or Today changes for Bookiji, update the Bookiji Master Tracker board manually (status and notes) — not automated from this repo.
