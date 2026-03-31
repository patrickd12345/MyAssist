import { describe, expect, it } from "vitest";
import { buildTodoistIntelligence } from "./todoistIntelligence";
import type { TodoistTaskPreview } from "./types";

function task(input: Partial<TodoistTaskPreview> & Pick<TodoistTaskPreview, "id" | "content">): TodoistTaskPreview {
  return {
    id: input.id,
    content: input.content,
    description: input.description ?? null,
    dueDate: input.dueDate ?? null,
    dueDatetime: input.dueDatetime ?? null,
    priority: input.priority ?? 1,
    projectId: input.projectId ?? null,
    labels: input.labels ?? [],
    isOverdue: input.isOverdue ?? false,
    isToday: input.isToday ?? false,
    source: "todoist",
  };
}

describe("todoistIntelligence", () => {
  it("captures overdue, due_today, and high-priority signals", () => {
    const out = buildTodoistIntelligence([
      task({ id: "o1", content: "Past due", isOverdue: true }),
      task({ id: "t1", content: "Today", isToday: true }),
      task({ id: "p1", content: "Important", priority: 4 }),
    ]);
    expect(out.signals.some((s) => s.type === "overdue_task")).toBe(true);
    expect(out.signals.some((s) => s.type === "due_today")).toBe(true);
    expect(out.signals.some((s) => s.type === "high_priority_task")).toBe(true);
  });

  it("detects job-search and follow-up terms from content and labels", () => {
    const out = buildTodoistIntelligence([
      task({ id: "j1", content: "Interview prep", labels: ["job-search"] }),
      task({ id: "f1", content: "Follow up with recruiter" }),
    ]);
    expect(out.signals.some((s) => s.type === "job_search_task")).toBe(true);
    expect(out.signals.some((s) => s.type === "follow_up_task")).toBe(true);
  });

  it("returns deterministic empty summary on no tasks", () => {
    const out = buildTodoistIntelligence([]);
    expect(out.signals).toEqual([]);
    expect(out.summary).toBe("No Todoist tasks in this context.");
  });
});
