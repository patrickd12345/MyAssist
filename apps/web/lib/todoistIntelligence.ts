import type { TodoistIntelligence, TodoistSignal, TodoistTaskPreview } from "./types";

const JOB_SEARCH_RE = /\b(job|application|interview|resume|cv|recruiter|referral)\b/i;
const FOLLOW_UP_RE = /\b(follow[ -]?up|reply|respond|check[- ]?in|ping)\b/i;
const BLOCKED_RE = /\b(blocked|waiting|dependency|awaiting)\b/i;

function textForTask(task: TodoistTaskPreview): string {
  return `${task.content} ${task.description ?? ""} ${task.labels.join(" ")}`.trim();
}

export function buildTodoistIntelligence(tasks: TodoistTaskPreview[]): TodoistIntelligence {
  const signals: TodoistSignal[] = [];
  const overdue = tasks.filter((t) => t.isOverdue);
  const dueToday = tasks.filter((t) => t.isToday);
  const highPriority = tasks.filter((t) => t.priority >= 3);
  const jobSearch = tasks.filter((t) => JOB_SEARCH_RE.test(textForTask(t)));
  const followUp = tasks.filter((t) => FOLLOW_UP_RE.test(textForTask(t)));
  const blocked = tasks.filter((t) => BLOCKED_RE.test(textForTask(t)));

  if (overdue.length > 0) {
    signals.push({ type: "overdue_task", detail: `${overdue.length} overdue task(s).`, taskIds: overdue.map((t) => t.id) });
  }
  if (dueToday.length > 0) {
    signals.push({ type: "due_today", detail: `${dueToday.length} due today.`, taskIds: dueToday.map((t) => t.id) });
  }
  if (highPriority.length > 0) {
    signals.push({
      type: "high_priority_task",
      detail: `${highPriority.length} high-priority task(s) (P3/P4).`,
      taskIds: highPriority.map((t) => t.id),
    });
  }
  if (jobSearch.length > 0) {
    signals.push({ type: "job_search_task", detail: `${jobSearch.length} job-search related task(s).`, taskIds: jobSearch.map((t) => t.id) });
  }
  if (followUp.length > 0) {
    signals.push({ type: "follow_up_task", detail: `${followUp.length} follow-up style task(s).`, taskIds: followUp.map((t) => t.id) });
  }
  if (blocked.length > 0) {
    signals.push({ type: "blocked_task", detail: `${blocked.length} blocked/waiting task(s).`, taskIds: blocked.map((t) => t.id) });
  }
  if (overdue.length + dueToday.length >= 8) {
    signals.push({ type: "task_heavy_day", detail: "Task load is heavy today (8+ urgent tasks)." });
  }

  const summary =
    tasks.length === 0
      ? "No Todoist tasks in this context."
      : `Todoist: ${overdue.length} overdue, ${dueToday.length} due today, ${highPriority.length} high-priority.`;

  return {
    signals,
    counts: {
      total: tasks.length,
      overdue: overdue.length,
      dueToday: dueToday.length,
      highPriority: highPriority.length,
    },
    summary,
  };
}
