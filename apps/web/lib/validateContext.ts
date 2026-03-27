import type { MyAssistDailyContext } from "./types";

export function isMyAssistDailyContext(value: unknown): value is MyAssistDailyContext {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.generated_at === "string" &&
    typeof o.run_date === "string" &&
    Array.isArray(o.todoist_overdue) &&
    Array.isArray(o.todoist_due_today) &&
    Array.isArray(o.todoist_upcoming_high_priority) &&
    Array.isArray(o.gmail_signals) &&
    Array.isArray(o.calendar_today)
  );
}
