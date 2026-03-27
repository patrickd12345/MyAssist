import { NextResponse } from "next/server";
import { formatActionTypeLabel } from "@/lib/actionResultModel";
import { readActionLogEntries, type StoredActionLogEntry } from "@/lib/services/crossSystemActionService";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const CALENDAR_ACTIONS = new Set<string>(["email_to_event", "task_to_calendar_block", "calendar_create_manual"]);
const TODOIST_ACTIONS = new Set<string>(["job_hunt_prep_tasks", "email_to_task"]);

function recoverableTargetsForEntry(e: StoredActionLogEntry): Array<{ kind: "calendar" | "todoist"; id: string }> {
  if (e.status !== "success" || e.deduped) return [];
  const out: Array<{ kind: "calendar" | "todoist"; id: string }> = [];
  for (const id of e.targetIds) {
    const trimmed = id.trim();
    if (!trimmed) continue;
    if (CALENDAR_ACTIONS.has(e.action)) out.push({ kind: "calendar", id: trimmed });
    if (TODOIST_ACTIONS.has(e.action)) out.push({ kind: "todoist", id: trimmed });
  }
  return out;
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entries = await readActionLogEntries(userId);
  const recent = entries.slice(-80).reverse();

  const rows = recent.map((e, idx) => ({
    id: `${e.timestamp}-${idx}`,
    action: e.action,
    actionLabel: formatActionTypeLabel(e.action),
    status: e.status,
    outcome:
      e.status === "failed"
        ? ("failed" as const)
        : e.deduped
          ? ("deduped" as const)
          : ("success" as const),
    timestamp: e.timestamp,
    sourceIds: e.sourceIds,
    targetIds: e.targetIds,
    error: e.error,
    recoverableTargets: recoverableTargetsForEntry(e),
  }));

  return NextResponse.json({ ok: true, rows });
}
