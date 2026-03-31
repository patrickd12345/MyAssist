import { getTaskDueCalendarDate, todayCalendarDateInTaskZone } from "./todoistTaskBuckets";
import type { TodoistTaskPreview } from "./types";

function asPriority(input: unknown): 1 | 2 | 3 | 4 {
  if (input === 4 || input === 3 || input === 2 || input === 1) return input;
  return 1;
}

export function mapTodoistTaskPreview(
  task: Record<string, unknown>,
  options?: { now?: Date; timeZone?: string },
): TodoistTaskPreview | null {
  const idRaw = task.id;
  const contentRaw = task.content;
  if ((typeof idRaw !== "string" && typeof idRaw !== "number") || typeof contentRaw !== "string") return null;

  const due = task.due as { date?: unknown; datetime?: unknown } | undefined;
  const dueDate = getTaskDueCalendarDate(task, options?.timeZone);
  const dueDatetime = typeof due?.datetime === "string" ? due.datetime : null;
  const today = todayCalendarDateInTaskZone(options?.now, options?.timeZone);
  const labels = Array.isArray(task.labels) ? task.labels.filter((x): x is string => typeof x === "string") : [];

  return {
    id: String(idRaw),
    content: contentRaw.trim() || "Untitled task",
    description: typeof task.description === "string" && task.description.trim() ? task.description.trim() : null,
    dueDate,
    dueDatetime,
    priority: asPriority(task.priority),
    projectId:
      typeof task.project_id === "string" || typeof task.project_id === "number" ? String(task.project_id) : null,
    labels,
    isOverdue: Boolean(dueDate && dueDate < today),
    isToday: Boolean(dueDate && dueDate === today),
    source: "todoist",
  };
}
