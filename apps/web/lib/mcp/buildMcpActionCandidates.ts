import "server-only";

import { mapTodoistTaskPreview } from "@/lib/todoistPreview";
import type { MyAssistDailyContext } from "@/lib/types";

export type McpActionCandidateKind = "complete_task" | "email_to_task";

export type McpActionCandidate = {
  action_id: string;
  label: string;
  kind: McpActionCandidateKind;
  metadata?: { bucket: "overdue" | "due_today" } | { source: "gmail" };
};

export type BuildMcpActionCandidatesResult = {
  generated_at: string;
  candidates: McpActionCandidate[];
};

/**
 * Lists executable MCP action candidates from daily context: Todoist complete (overdue + due today)
 * and email_to_task for current Gmail signal rows with a message id.
 */
export function buildMcpActionCandidates(
  context: Pick<
    MyAssistDailyContext,
    "generated_at" | "todoist_overdue" | "todoist_due_today" | "gmail_signals"
  >,
): BuildMcpActionCandidatesResult {
  const seen = new Set<string>();
  const candidates: McpActionCandidate[] = [];

  function addBucket(tasks: MyAssistDailyContext["todoist_overdue"], bucket: "overdue" | "due_today") {
    for (const task of tasks) {
      const preview = mapTodoistTaskPreview(task as Record<string, unknown>);
      if (!preview) continue;
      const id = preview.id;
      const aid = `complete_task:${id}`;
      if (seen.has(aid)) continue;
      seen.add(aid);
      candidates.push({
        action_id: aid,
        label: preview.content.length > 200 ? `${preview.content.slice(0, 197)}...` : preview.content,
        kind: "complete_task",
        metadata: { bucket },
      });
    }
  }

  addBucket(context.todoist_overdue, "overdue");
  addBucket(context.todoist_due_today, "due_today");

  for (const g of context.gmail_signals ?? []) {
    const mid = g.id !== undefined && g.id !== null ? String(g.id).trim() : "";
    if (!mid) continue;
    const aid = `email_to_task:${mid}`;
    if (seen.has(aid)) continue;
    seen.add(aid);
    const subj = typeof g.subject === "string" && g.subject.trim() ? g.subject.trim() : "(no subject)";
    const label = subj.length > 200 ? `${subj.slice(0, 197)}...` : subj;
    candidates.push({
      action_id: aid,
      label,
      kind: "email_to_task",
      metadata: { source: "gmail" },
    });
  }

  return { generated_at: context.generated_at, candidates };
}
