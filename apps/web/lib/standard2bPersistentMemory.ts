import "server-only";
import {
  commitSessionBoundary,
  emptySessionBoundaryPayload,
  startSession,
  type PersistentSessionHandle,
  type SessionBoundaryPayload,
} from "@bookiji-inc/persistent-memory-runtime";
import type { AssistantReply, TaskDraft } from "@/lib/assistant";

/** Standard 2b product id — must match `ProductId` in persistent-memory-runtime. */
export const MYASSIST_STANDARD_2B_PRODUCT = "myassist" as const;

/**
 * Resolve tenant key: always anchored on stable `userId` (persists across sessions). Optional
 * `MYASSIST_PERSISTENT_MEMORY_TENANT` suffix namespaces the file (e.g. staging vs prod); never a random/session id.
 */
export function resolveMyAssistPersistentMemoryTenantKey(userId: string): string {
  const suffix = process.env.MYASSIST_PERSISTENT_MEMORY_TENANT?.trim();
  if (suffix) return `${userId}:${suffix}`;
  return userId;
}

export async function startMyAssistStandard2bSession(userId: string): Promise<PersistentSessionHandle> {
  const tenantKey = resolveMyAssistPersistentMemoryTenantKey(userId);
  return startSession(MYASSIST_STANDARD_2B_PRODUCT, tenantKey);
}

/**
 * Text block for the chat user message — last committed boundary plus a short recent tail (optional).
 */
export function formatPersistentMemoryContextForPrompt(handle: PersistentSessionHandle): string {
  const { lastCommitted, history } = handle.memory;
  if (!lastCommitted && history.length === 0) {
    return "(No prior Standard 2b session boundaries stored for this tenant.)";
  }
  const parts: string[] = [];
  if (lastCommitted) {
    parts.push("last_committed:", JSON.stringify(lastCommitted));
  }
  const tail = history.slice(-3);
  if (tail.length > 0) {
    parts.push(`recent_boundaries_tail (${tail.length}):`, JSON.stringify(tail));
  }
  return parts.join("\n");
}

function taskDraftLine(draft: TaskDraft): string {
  const bits = [draft.content];
  if (draft.dueString) bits.push(`due:${draft.dueString}`);
  if (draft.priority) bits.push(`p${draft.priority}`);
  return bits.join(" ");
}

/**
 * Build a Standard 2b payload from an assistant turn. Returns null when there is nothing
 * meaningful to persist (avoids committing on every short chat line).
 */
export function buildBoundaryPayloadFromAssistantTurn(
  parsed: Omit<AssistantReply, "mode">,
): SessionBoundaryPayload | null {
  const hasStructure =
    parsed.actions.length > 0 || parsed.followUps.length > 0 || parsed.taskDraft != null;
  if (!hasStructure) return null;

  const payload = emptySessionBoundaryPayload(parsed.answer.slice(0, 1200));
  payload.next_actions = [...parsed.actions];
  payload.newlyActiveWork = [...parsed.followUps];
  if (parsed.taskDraft) {
    payload.in_progress = [taskDraftLine(parsed.taskDraft)];
  }
  return payload;
}

export async function commitMyAssistBoundaryIfMeaningful(
  handle: PersistentSessionHandle,
  parsed: Omit<AssistantReply, "mode">,
): Promise<void> {
  const payload = buildBoundaryPayloadFromAssistantTurn(parsed);
  if (!payload) return;
  await commitSessionBoundary(handle, payload);
}
