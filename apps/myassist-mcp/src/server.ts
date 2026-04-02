import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errResult(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

function getBaseUrl(): string {
  return process.env.MYASSIST_WEB_URL?.trim().replace(/\/$/, "") ?? "http://127.0.0.1:3000";
}

async function fetchMcpJson(path: string, init?: RequestInit): Promise<unknown> {
  const token = process.env.MYASSIST_MCP_TOKEN?.trim();
  if (!token) {
    throw new Error("MYASSIST_MCP_TOKEN is required");
  }
  const base = getBaseUrl();
  const url = new URL(path.startsWith("/") ? path : `/${path}`, `${base}/`);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.body != null && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${path} ${res.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as unknown;
}

async function fetchDailyContext(args: { date?: string; timezone?: string }) {
  const url = new URL(`${getBaseUrl()}/api/mcp/daily-context`);
  if (args.date?.trim()) url.searchParams.set("date", args.date.trim());
  if (args.timezone?.trim()) url.searchParams.set("timezone", args.timezone.trim());

  const token = process.env.MYASSIST_MCP_TOKEN?.trim();
  if (!token) {
    throw new Error("MYASSIST_MCP_TOKEN is required");
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`daily-context ${res.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as unknown;
}

async function main() {
  const server = new McpServer(
    { name: "myassist-mcp", version: "0.2.0" },
    {
      instructions:
        "MyAssist MCP: get_daily_context is read-only. Action tools list Todoist complete_task candidates, mint approval_token via approve_action, then execute_action with that token — the host must obtain explicit human confirmation before approve_action and execute_action. Uses MYASSIST_WEB_URL (default http://127.0.0.1:3000) and MYASSIST_MCP_TOKEN. The web server must set MYASSIST_MCP_USER_ID.",
    },
  );

  server.registerTool(
    "get_daily_context",
    {
      description:
        "Returns the unified MyAssist daily context JSON (same shape as GET /api/daily-context): Gmail signals, calendar, Todoist buckets, unified_daily_briefing, good_morning_message.",
      inputSchema: {
        date: z.string().optional().describe("ISO date (YYYY-MM-DD); reserved for future filtering"),
        timezone: z.string().optional().describe("IANA timezone; reserved for future filtering"),
      },
    },
    async (args) => {
      try {
        const data = await fetchDailyContext(args);
        return jsonResult(data);
      } catch (e) {
        return errResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "list_action_candidates",
    {
      description:
        "Lists MCP action candidates from the current daily context (v1: complete_task for Todoist tasks in overdue and due-today buckets). Read-only. Each item has action_id for use with approve_action.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await fetchMcpJson("/api/mcp/action-candidates", { method: "GET" });
        return jsonResult(data);
      } catch (e) {
        return errResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "approve_action",
    {
      description:
        "Mints a short-lived approval_token for an action_id returned by list_action_candidates. Call only after explicit human approval in the host UI. The token is required for execute_action.",
      inputSchema: {
        action_id: z.string().min(1).describe("Exact action_id from list_action_candidates"),
      },
    },
    async (args) => {
      try {
        const data = await fetchMcpJson("/api/mcp/approve", {
          method: "POST",
          body: JSON.stringify({ action_id: args.action_id }),
        });
        return jsonResult(data);
      } catch (e) {
        return errResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "execute_action",
    {
      description:
        "Runs a gated action: complete_task (Todoist) or email_to_task (Gmail) per action_id from list_action_candidates, using approval_token from approve_action. Destructive. Requires prior human-approved approve_action in the same workflow.",
      inputSchema: {
        action_id: z.string().min(1),
        approval_token: z.string().min(1),
      },
    },
    async (args) => {
      try {
        const data = await fetchMcpJson("/api/mcp/execute", {
          method: "POST",
          body: JSON.stringify({
            action_id: args.action_id,
            approval_token: args.approval_token,
          }),
        });
        return jsonResult(data);
      } catch (e) {
        return errResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
