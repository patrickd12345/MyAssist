import { describe, expect, it } from "vitest";
import {
  bucketTodoistTasksFromApi,
  calendarDateInTimeZone,
  getTaskDueCalendarDate,
  todayCalendarDateInTaskZone,
} from "./todoistTaskBuckets";

const TZ = "America/Toronto";

describe("todoistTaskBuckets", () => {
  it("places date-only task due today in Today (Toronto calendar)", () => {
    const now = new Date("2026-06-15T16:00:00.000Z");
    expect(todayCalendarDateInTaskZone(now, TZ)).toBe("2026-06-15");

    const tasks: Record<string, unknown>[] = [
      { id: "t1", content: "Due today", priority: 1, due: { date: "2026-06-15" } },
    ];
    const out = bucketTodoistTasksFromApi(tasks, { now, timeZone: TZ });
    expect(out.todoist_due_today.map((t) => t.id)).toEqual(["t1"]);
    expect(out.todoist_overdue).toHaveLength(0);
  });

  it("places date-only task due before today in Overdue", () => {
    const now = new Date("2026-06-15T16:00:00.000Z");
    const tasks: Record<string, unknown>[] = [
      { id: "o1", content: "Late", priority: 1, due: { date: "2026-06-10" } },
    ];
    const out = bucketTodoistTasksFromApi(tasks, { now, timeZone: TZ });
    expect(out.todoist_overdue.map((t) => t.id)).toEqual(["o1"]);
    expect(out.todoist_due_today).toHaveLength(0);
  });

  it("classifies due.datetime by calendar date in task zone, not UTC day only", () => {
    const now = new Date("2026-03-26T10:00:00.000Z");
    const tasks: Record<string, unknown>[] = [
      {
        id: "dt1",
        content: "Time-specific",
        priority: 1,
        due: { datetime: "2026-03-26T14:00:00.000Z" },
      },
    ];
    const out = bucketTodoistTasksFromApi(tasks, { now, timeZone: TZ });
    const dueCal = getTaskDueCalendarDate(tasks[0]!, TZ);
    expect(dueCal).toBe(calendarDateInTimeZone(new Date("2026-03-26T14:00:00.000Z"), TZ));
    expect(out.todoist_due_today.some((t) => t.id === "dt1")).toBe(true);
  });

  it("puts high-priority tasks without due in upcoming bucket (same pipeline as brief-relevant lists)", () => {
    const now = new Date("2026-06-15T16:00:00.000Z");
    const tasks: Record<string, unknown>[] = [
      { id: "hp1", content: "No due", priority: 4 },
    ];
    const out = bucketTodoistTasksFromApi(tasks, { now, timeZone: TZ });
    expect(out.todoist_upcoming_high_priority.map((t) => t.id)).toEqual(["hp1"]);
    expect(out.todoist_overdue).toHaveLength(0);
    expect(out.todoist_due_today).toHaveLength(0);
  });

  it("uses same due key for sorting as for bucketing (date-only vs datetime)", () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    const tasks: Record<string, unknown>[] = [
      { id: "a", content: "A", priority: 1, due: { date: "2026-06-15" } },
      { id: "b", content: "B", priority: 1, due: { date: "2026-06-14" } },
    ];
    const out = bucketTodoistTasksFromApi(tasks, { now, timeZone: TZ });
    expect(out.todoist_overdue[0]?.id).toBe("b");
    expect(out.todoist_due_today[0]?.id).toBe("a");
  });

  it("fills Overdue, Today, and upcoming high-priority from one normalized pass over the same task list", () => {
    const now = new Date("2026-08-20T18:00:00.000Z");
    const tasks: Record<string, unknown>[] = [
      { id: "ov", content: "Past", priority: 1, due: { date: "2026-08-19" } },
      { id: "td", content: "Today", priority: 2, due: { date: "2026-08-20" } },
      { id: "hp", content: "P3 no date", priority: 3 },
    ];
    const out = bucketTodoistTasksFromApi(tasks, { now, timeZone: TZ });
    expect(out.todoist_overdue.map((t) => t.id)).toEqual(["ov"]);
    expect(out.todoist_due_today.map((t) => t.id)).toEqual(["td"]);
    expect(out.todoist_upcoming_high_priority.map((t) => t.id)).toEqual(["hp"]);
  });
});
