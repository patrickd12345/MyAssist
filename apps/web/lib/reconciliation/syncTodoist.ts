import { TodoistAdapter } from "../adapters/todoistAdapter";
import type { ReconciliationDelta } from "./reconcileEmailFacts";
import { computeObligationHash } from "./reconcileEmailFacts";

export async function syncTodoist(
  userId: string,
  threadId: string,
  delta: ReconciliationDelta
): Promise<void> {
  const adapter = new TodoistAdapter(userId);

  // Helper to build the tracing comment
  const buildDescription = (hash: string, evidence: string) => {
    return `${evidence}\n\n<!-- MYASSIST_META:\n{\n  "thread_id": "${threadId}",\n  "obligation_hash": "${hash}"\n}\n-->`;
  };

  // 1. New -> Create Task
  for (const item of delta.new) {
    const hash = computeObligationHash(item.title);
    try {
      await adapter.create({
        content: item.title,
        description: buildDescription(hash, item.evidence),
        ...(item.dueDate ? { dueString: item.dueDate } : {}),
      });
      // In a more complex implementation, we'd write the returned Todoist ID back to DB.
      // Keeping it minimal as requested.
    } catch (e) {
      console.error(`Todoist sync error on create for ${item.title}:`, e);
    }
  }

  // 2. Updated -> Update Task
  for (const { db, extracted } of delta.updated) {
    if (!db.todoist_task_id) continue;
    try {
      await adapter.update(db.todoist_task_id, {
        content: extracted.title,
        description: buildDescription(db.obligation_hash, extracted.evidence),
        ...(extracted.dueDate ? { dueString: extracted.dueDate } : {}),
      });
    } catch (e) {
      console.error(`Todoist sync error on update for task ${db.todoist_task_id}:`, e);
    }
  }

  // 3. Completed -> Close Task
  for (const { db } of delta.completed) {
    if (!db.todoist_task_id) continue;
    try {
      await adapter.complete(db.todoist_task_id);
    } catch (e) {
      console.error(`Todoist sync error on complete for task ${db.todoist_task_id}:`, e);
    }
  }

  // 4. Invalidated -> Label/Comment (Do not delete)
  for (const db of delta.invalidated) {
    if (!db.todoist_task_id) continue;
    try {
      // Just update the description to note it was invalidated
      await adapter.update(db.todoist_task_id, {
        description: `[INVALIDATED] Evidence suggests this task is no longer relevant.\n\n<!-- MYASSIST_META:\n{\n  "thread_id": "${threadId}",\n  "obligation_hash": "${db.obligation_hash}"\n}\n-->`,
      });
    } catch (e) {
      console.error(`Todoist sync error on invalidate for task ${db.todoist_task_id}:`, e);
    }
  }
}
