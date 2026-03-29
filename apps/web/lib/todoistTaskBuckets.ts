import { resolveMyAssistRuntimeEnv } from "./env/runtime";

/**
 * Todoist REST `due.date` is a calendar day in the user's timezone (YYYY-MM-DD).
 * Comparing it to UTC "today" mis-classifies tasks (empty Overdue/Today vs Brief picks).
 * Use one operational timezone for "today" and map `due.datetime` into that same calendar space.
 */

export const DEFAULT_TASK_DAY_TIMEZONE =
  resolveMyAssistRuntimeEnv().myassistTaskDayTz.trim() || "America/Toronto";

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

/**
 * First UTC ms of calendar day `ymd` (YYYY-MM-DD) in `timeZone` (midnight local).
 */
export function startOfCalendarDayUtcMs(ymd: string, timeZone: string): number {
  const [Y, M, D] = ymd.split("-").map((s) => parseInt(s, 10));
  if (!Number.isFinite(Y) || !Number.isFinite(M) || !Number.isFinite(D)) return 0;
  const target = `${Y}-${String(M).padStart(2, "0")}-${String(D).padStart(2, "0")}`;
  let lo = Date.UTC(Y, M - 1, D - 1, 0, 0, 0);
  let hi = Date.UTC(Y, M - 1, D + 1, 0, 0, 0);
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const cal = calendarDateInTimeZone(new Date(mid), timeZone);
    if (cal < target) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * Sort key aligned with Todoist's Today / Overdue lists: chronological by due (datetime or start of day),
 * not just YYYY-MM-DD string order.
 */
export function getTaskDueSortMs(
  task: Record<string, unknown>,
  timeZone: string = DEFAULT_TASK_DAY_TIMEZONE,
): number {
  const due = task.due as Record<string, unknown> | undefined;
  if (!due || typeof due !== "object") return Number.MAX_SAFE_INTEGER;
  if (typeof due.datetime === "string" && due.datetime.trim()) {
    const t = new Date(due.datetime.trim()).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (typeof due.date === "string" && due.date.trim()) {
    return startOfCalendarDayUtcMs(due.date.trim(), timeZone);
  }
  return Number.MAX_SAFE_INTEGER;
}

function getDeadlineSortMs(task: Record<string, unknown>): number | null {
  const deadline = task.deadline as { date?: string } | undefined;
  if (deadline && typeof deadline.date === "string") {
    const t = Date.parse(deadline.date.trim());
    if (Number.isFinite(t)) return t;
  }
  if (typeof task.deadline_date === "string") {
    const t = Date.parse(task.deadline_date.trim());
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/**
 * Todoist-like: earliest due first; same due instant → tasks with a separate deadline field first
 * (then by deadline date); then higher API priority (4 = urgent) first; then stable id.
 */
export function compareTasksTodoistOrder(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  timeZone: string = DEFAULT_TASK_DAY_TIMEZONE,
): number {
  const dueA = getTaskDueSortMs(a, timeZone);
  const dueB = getTaskDueSortMs(b, timeZone);
  if (dueA !== dueB) return dueA - dueB;

  const deadlineA = getDeadlineSortMs(a);
  const deadlineB = getDeadlineSortMs(b);
  const hasA = deadlineA !== null;
  const hasB = deadlineB !== null;
  if (hasA !== hasB) return hasA ? -1 : 1;
  if (hasA && hasB && deadlineA !== deadlineB) return deadlineA - deadlineB;

  const priorityA = getTaskPriority(a);
  const priorityB = getTaskPriority(b);
  if (priorityA !== priorityB) return priorityB - priorityA;
  return String(a.id ?? "").localeCompare(String(b.id ?? ""));
}

function compareTasks(a: Record<string, unknown>, b: Record<string, unknown>, timeZone: string): number {
  return compareTasksTodoistOrder(a, b, timeZone);
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
