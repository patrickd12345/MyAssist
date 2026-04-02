import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mintApprovalToken } from "@/lib/mcp/mcpActionApprovalToken";

const completeTask = vi.fn();
const emailToTask = vi.fn();

vi.mock("@/lib/services/crossSystemActionService", () => ({
  createCrossSystemActionService: () => ({
    completeTask: (...args: unknown[]) => completeTask(...args),
    emailToTask: (...args: unknown[]) => emailToTask(...args),
  }),
}));

let POST: (req: NextRequest) => Promise<Response>;

beforeEach(async () => {
  process.env.MYASSIST_MCP_TOKEN = "test-mcp-secret";
  process.env.MYASSIST_MCP_USER_ID = "user-mcp-1";
  completeTask.mockResolvedValue({ ok: true, action: "complete_task" });
  emailToTask.mockResolvedValue({ ok: true, action: "email_to_task", sourceEmailId: "m1" });
  const mod = await import("./route");
  POST = mod.POST;
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.MYASSIST_MCP_TOKEN;
  delete process.env.MYASSIST_MCP_USER_ID;
});

describe("POST /api/mcp/execute", () => {
  it("returns 400 when token is invalid", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/mcp/execute", {
        method: "POST",
        headers: { Authorization: "Bearer test-mcp-secret", "Content-Type": "application/json" },
        body: JSON.stringify({
          action_id: "complete_task:a1",
          approval_token: "not-a-real-token",
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(completeTask).not.toHaveBeenCalled();
  });

  it("calls completeTask when token is valid", async () => {
    const { approval_token } = mintApprovalToken("user-mcp-1", "complete_task:a1");
    const res = await POST(
      new NextRequest("http://localhost/api/mcp/execute", {
        method: "POST",
        headers: { Authorization: "Bearer test-mcp-secret", "Content-Type": "application/json" },
        body: JSON.stringify({
          action_id: "complete_task:a1",
          approval_token,
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(completeTask).toHaveBeenCalledWith("a1");
  });

  it("calls emailToTask for email_to_task action_id", async () => {
    const { approval_token } = mintApprovalToken("user-mcp-1", "email_to_task:msg-99");
    const res = await POST(
      new NextRequest("http://localhost/api/mcp/execute", {
        method: "POST",
        headers: { Authorization: "Bearer test-mcp-secret", "Content-Type": "application/json" },
        body: JSON.stringify({
          action_id: "email_to_task:msg-99",
          approval_token,
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(emailToTask).toHaveBeenCalledWith("msg-99");
    expect(completeTask).not.toHaveBeenCalled();
  });
});
