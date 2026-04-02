import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mintApprovalToken,
  parseCompleteTaskActionId,
  parseMcpExecutableActionId,
  verifyApprovalToken,
} from "./mcpActionApprovalToken";

describe("mcpActionApprovalToken", () => {
  beforeEach(() => {
    process.env.MYASSIST_MCP_TOKEN = "test-token-for-hmac";
    delete process.env.MYASSIST_ACTION_APPROVAL_SECRET;
  });

  afterEach(() => {
    delete process.env.MYASSIST_MCP_TOKEN;
    delete process.env.MYASSIST_ACTION_APPROVAL_SECRET;
    vi.useRealTimers();
  });

  it("mints and verifies a token for the same user and action_id", () => {
    const { approval_token, expires_at } = mintApprovalToken("user-1", "complete_task:abc");
    expect(expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(verifyApprovalToken("user-1", "complete_task:abc", approval_token)).toEqual({ ok: true });
  });

  it("rejects wrong user", () => {
    const { approval_token } = mintApprovalToken("user-1", "complete_task:abc");
    expect(verifyApprovalToken("user-2", "complete_task:abc", approval_token).ok).toBe(false);
  });

  it("rejects wrong action_id", () => {
    const { approval_token } = mintApprovalToken("user-1", "complete_task:abc");
    expect(verifyApprovalToken("user-1", "complete_task:xyz", approval_token).ok).toBe(false);
  });

  it("rejects expired token", () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const { approval_token } = mintApprovalToken("user-1", "complete_task:abc", 1000);
    vi.setSystemTime(now + 2000);
    expect(verifyApprovalToken("user-1", "complete_task:abc", approval_token).ok).toBe(false);
  });

  it("rejects tampered token", () => {
    const { approval_token } = mintApprovalToken("user-1", "complete_task:abc");
    const tampered = approval_token.slice(0, -4) + "xxxx";
    expect(verifyApprovalToken("user-1", "complete_task:abc", tampered).ok).toBe(false);
  });

  it("uses MYASSIST_ACTION_APPROVAL_SECRET when set", () => {
    process.env.MYASSIST_ACTION_APPROVAL_SECRET = "explicit-secret";
    const a = mintApprovalToken("u", "complete_task:1");
    expect(verifyApprovalToken("u", "complete_task:1", a.approval_token).ok).toBe(true);
    process.env.MYASSIST_MCP_TOKEN = "different";
    expect(verifyApprovalToken("u", "complete_task:1", a.approval_token).ok).toBe(true);
  });
});

describe("parseCompleteTaskActionId", () => {
  it("parses complete_task ids", () => {
    expect(parseCompleteTaskActionId("complete_task:12345")).toEqual({
      kind: "complete_task",
      sourceId: "12345",
    });
  });

  it("returns null for other prefixes", () => {
    expect(parseCompleteTaskActionId("email_to_task:x")).toBeNull();
  });
});

describe("parseMcpExecutableActionId", () => {
  it("parses complete_task and email_to_task", () => {
    expect(parseMcpExecutableActionId("complete_task:1")).toEqual({
      kind: "complete_task",
      sourceId: "1",
    });
    expect(parseMcpExecutableActionId("email_to_task:abc")).toEqual({
      kind: "email_to_task",
      sourceId: "abc",
    });
    expect(parseMcpExecutableActionId("unknown:x")).toBeNull();
  });
});
