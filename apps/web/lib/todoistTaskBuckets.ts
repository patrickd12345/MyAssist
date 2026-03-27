/**
 * Todoist REST `due.date` is a calendar day in the user's timezone (YYYY-MM-DD).
 * Comparing it to UTC "today" mis-classifies tasks (empty Overdue/Today vs Brief picks).
 * Use one operational timezone for "today" and map `due.datetime` into that same calendar space.
 */

export const DEFAULT_TASK_DAY_TIMEZONE =
  (typeof process !== "undefined" && process.env.MYASSIST_TASK_DAY_TZ?.trim()) || "America/Toronto";

export function calendarDateInTimeZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) return instant.toISOString().slice(0, 10);
  return `${y}-${m}-${d}`;
}

export function todayCalendarDateInTaskZone(
  now: Date = new Date(),
  timeZone: string = DEFAULT_TASK_DAY_TIMEZONE,
): string {
  return calendarDateInTimeZone(now, timeZone);
}

export function getTaskDueCalendarDate(
  task: Record<string, unknown>,
  timeZone: string = DEFAULT_TASK_DAY_TIMEZONE,
): string | null {
  const due = task.due as Record<string, unknown> | undefined;
  if (!due || typeof due !== "object") return null;
  if (typeof due.date === "string" && due.date.trim()) return due.date.trim();
  if (typeof due.datetime === "string" && due.datetime.trim()) {
    const parsed = new Date(due.datetime);
    if (!Number.isNaN(parsed.getTime())) return calendarDateInTimeZone(parsed, timeZone);
  }
  return null;
}

function getTaskPriority(task: Record<string, unknown>): number {
  return typeof task.priority === "number" ? task.priority : 1;
}

function compareTasks(a: Record<string, unknown>, b: Record<string, unknown>, timeZone: string): number {
  const dueA = getTaskDueCalendarDate(a, timeZone) ?? "9999-12-31";
  const dueB = getTaskDueCalendarDate(b, timeZone) ?? "9999-12-31";
  if (dueA !== dueB) return dueA.localeCompare(dueB);
  const priorityA = getTaskPriority(a);
  const priorityB = getTaskPriority(b);
  if (priorityA !== priorityB) return priorityB - priorityA;
  return String(a.id ?? "").localeCompare(String(b.id ?? ""));
}

export type TodoistBucketSlices = {
  todoist_overdue: Record<string, unknown>[];
  todoist_due_today: Record<string, unknown>[];
  todoist_upcoming_high_priority: Record<string, unknown>[];
};

export function bucketTodoistTasksFromApi(
  tasks: Record<string, unknown>[],
  options?: { now?: Date; timeZone?: string },
): TodoistBucketSlices {
  const timeZone = options?.timeZone ?? DEFAULT_TASK_DAY_TIMEZONE;
  const now = options?.now ?? new Date();
  const today = todayCalendarDateInTaskZone(now, timeZone);

  const todoist_overdue: Record<string, unknown>[] = [];
  const todoist_due_today: Record<string, unknown>[] = [];
  const todoist_upcoming_high_priority: Record<string, unknown>[] = [];

  for (const task of tasks) {
    const dueDate = getTaskDueCalendarDate(task, timeZone);
    if (dueDate && dueDate < today) {
      todoist_overdue.push(task);
      continue;
    }
    if (dueDate && dueDate === today) {
      todoist_due_today.push(task);
      continue;
    }
    if (getTaskPriority(task) >= 3) {
      todoist_upcoming_high_priority.push(task);
    }
  }

  todoist_overdue.sort((a, b) => compareTasks(a, b, timeZone));
  todoist_due_today.sort((a, b) => compareTasks(a, b, timeZone));
  todoist_upcoming_high_priority.sort((a, b) => compareTasks(a, b, timeZone));

  return {
    todoist_overdue: todoist_overdue.slice(0, 50),
    todoist_due_today: todoist_due_today.slice(0, 50),
    todoist_upcoming_high_priority: todoist_upcoming_high_priority.slice(0, 50),
  };
}
