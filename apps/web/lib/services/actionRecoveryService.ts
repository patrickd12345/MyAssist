import "server-only";

import { createCalendarAdapter } from "@/lib/adapters/calendarAdapter";
import { createTodoistAdapter } from "@/lib/adapters/todoistAdapter";
import {
  type ActionName,
  readActionLogEntries,
  type StoredActionLogEntry,
} from "@/lib/services/crossSystemActionService";

const CALENDAR_RECOVER_ACTIONS: ActionName[] = ["email_to_event", "task_to_calendar_block", "calendar_create_manual"];

const TODOIST_RECOVER_ACTIONS: ActionName[] = ["job_hunt_prep_tasks", "email_to_task"];

export function findRecoverableEntry(
  entries: StoredActionLogEntry[],
  targetId: string,
  kind: "calendar" | "todoist",
): StoredActionLogEntry | null {
  const id = targetId.trim();
  if (!id) return null;
  const allowed = kind === "calendar" ? CALENDAR_RECOVER_ACTIONS : TODOIST_RECOVER_ACTIONS;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]!;
    if (e.status !== "success" || e.deduped) continue;
    if (!allowed.includes(e.action)) continue;
    if (!e.targetIds.includes(id)) continue;
    return e;
  }
  return null;
}

export async function recoverCreatedTarget(
  userId: string,
  targetId: string,
  kind: "calendar" | "todoist",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const entries = await readActionLogEntries(userId);
  const hit = findRecoverableEntry(entries, targetId, kind);
  if (!hit) {
    return { ok: false, error: "No matching MyAssist-created item found to recover." };
  }
  try {
    if (kind === "calendar") {
      const cal = createCalendarAdapter(userId);
      await cal.archive(targetId.trim());
    } else {
      const todo = createTodoistAdapter(userId);
      await todo.delete(targetId.trim());
    }
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : "Recovery failed.",
    };
  }
}
