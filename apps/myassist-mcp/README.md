# myassist-mcp

Stdio MCP server exposing `get_daily_context` (read-only) and approval-gated action tools (`list_action_candidates`, `approve_action`, `execute_action`) against the MyAssist web app.

## Prerequisites

1. Next app running with MCP routes enabled (see [`GET /api/mcp/daily-context`](../web/app/api/mcp/daily-context/route.ts) and [`/api/mcp/action-candidates`](../web/app/api/mcp/action-candidates/route.ts)).
2. In `apps/web/.env.local` (or process env for `next start`):

   - **Either** legacy `MYASSIST_MCP_TOKEN` + `MYASSIST_MCP_USER_ID`, **or** on the web app `MYASSIST_MCP_CLIENTS_JSON` / `MYASSIST_MCP_CLIENTS_FILE` mapping bearer tokens to user ids (see `apps/web/.env.example`).
   - Optional: `MYASSIST_ACTION_APPROVAL_SECRET` — long random secret used to sign `approve_action` tokens (if omitted, the web app derives signing material from the token or client list).

## Environment (this package)

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `MYASSIST_WEB_URL` | No | `http://127.0.0.1:3000` | Base URL of the web app |
| `MYASSIST_MCP_TOKEN` | Yes* | — | Must match the web app legacy token or one `bearerToken` in `MYASSIST_MCP_CLIENTS_JSON` |

## Run

```bash
cd apps/myassist-mcp
pnpm dev
```

From repo root:

```bash
pnpm myassist-mcp:dev
```

## Cursor / Claude Desktop

Merge a block like [`tools/cursor-mcp-myassist.example.json`](../../tools/cursor-mcp-myassist.example.json) into the MCP config. Set `cwd` to the absolute path of `apps/myassist-mcp`.

## See also

- [docs/mcp-myassist-tools.md](../../docs/mcp-myassist-tools.md) — tool list and JSON schemas
- [docs/product-kpis.md](../../docs/product-kpis.md) — KPI events including MCP path
