import "server-only";

import crypto from "node:crypto";

import { getMcpClientsConfigMaterialForApprovalSecret } from "@/lib/mcp/mcpClientEntries";

const DEFAULT_TTL_MS = 10 * 60 * 1000;

function getApprovalSecret(): string {
  const explicit = process.env.MYASSIST_ACTION_APPROVAL_SECRET?.trim();
  if (explicit) return explicit;
  const mcp = process.env.MYASSIST_MCP_TOKEN?.trim();
  if (mcp) {
    return crypto.createHash("sha256").update(`myassist|mcp|action|approval|${mcp}`).digest("hex");
  }
  const clientsMaterial = getMcpClientsConfigMaterialForApprovalSecret();
  if (clientsMaterial) {
    return crypto.createHash("sha256").update(`myassist|mcp|action|approval|${clientsMaterial}`).digest("hex");
  }
  throw new Error(
    "Set MYASSIST_ACTION_APPROVAL_SECRET, or MYASSIST_MCP_TOKEN, or MYASSIST_MCP_CLIENTS_JSON / MYASSIST_MCP_CLIENTS_FILE for approval tokens",
  );
}

function sign(userId: string, actionId: string, expMs: number): string {
  return crypto
    .createHmac("sha256", getApprovalSecret())
    .update(`${userId}\n${actionId}\n${expMs}`)
    .digest("base64url");
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export type MintApprovalTokenResult = { approval_token: string; expires_at: string };

export function mintApprovalToken(
  userId: string,
  actionId: string,
  ttlMs: number = DEFAULT_TTL_MS,
): MintApprovalTokenResult {
  const expMs = Date.now() + ttlMs;
  const sig = sign(userId, actionId, expMs);
  const payload = { v: 1 as const, uid: userId, aid: actionId, exp: expMs, sig };
  const approval_token = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return { approval_token, expires_at: new Date(expMs).toISOString() };
}

export type VerifyApprovalTokenResult = { ok: true } | { ok: false; reason: string };

export function verifyApprovalToken(
  userId: string,
  actionId: string,
  approvalToken: string,
): VerifyApprovalTokenResult {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(approvalToken, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid_token_encoding" };
  }
  if (!raw || typeof raw !== "object") return { ok: false, reason: "invalid_token_shape" };
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return { ok: false, reason: "unsupported_version" };
  if (o.uid !== userId) return { ok: false, reason: "user_mismatch" };
  if (o.aid !== actionId) return { ok: false, reason: "action_mismatch" };
  const expMs = typeof o.exp === "number" ? o.exp : NaN;
  if (!Number.isFinite(expMs) || Date.now() > expMs) return { ok: false, reason: "expired" };
  const expectedSig = sign(userId, actionId, expMs);
  const sig = typeof o.sig === "string" ? o.sig : "";
  if (!timingSafeEqualStrings(sig, expectedSig)) return { ok: false, reason: "bad_signature" };
  return { ok: true };
}

/** v1: only `complete_task:<todoistTaskId>` */
export function parseCompleteTaskActionId(actionId: string): { kind: "complete_task"; sourceId: string } | null {
  const prefix = "complete_task:";
  if (!actionId.startsWith(prefix)) return null;
  const sourceId = actionId.slice(prefix.length).trim();
  if (!sourceId || sourceId.includes("\n")) return null;
  return { kind: "complete_task", sourceId };
}

/** `email_to_task:<gmailMessageId>` */
export function parseEmailToTaskActionId(actionId: string): { kind: "email_to_task"; sourceId: string } | null {
  const prefix = "email_to_task:";
  if (!actionId.startsWith(prefix)) return null;
  const sourceId = actionId.slice(prefix.length).trim();
  if (!sourceId || sourceId.includes("\n")) return null;
  return { kind: "email_to_task", sourceId };
}

export type ParsedMcpExecutableAction =
  | { kind: "complete_task"; sourceId: string }
  | { kind: "email_to_task"; sourceId: string };

export function parseMcpExecutableActionId(actionId: string): ParsedMcpExecutableAction | null {
  const a = parseCompleteTaskActionId(actionId);
  if (a) return a;
  const b = parseEmailToTaskActionId(actionId);
  if (b) return b;
  return null;
}
