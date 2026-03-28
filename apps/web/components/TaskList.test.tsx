import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskList } from "./TaskList";

describe("TaskList", () => {
  it("shows empty label when there are no tasks", () => {
    render(
      <TaskList title="Overdue" tasks={[]} emptyLabel="Nothing here." pendingTaskIds={[]} />,
    );
    expect(screen.getByRole("heading", { name: "Overdue" })).toBeInTheDocument();
    expect(screen.getByText("Nothing here.")).toBeInTheDocument();
  });

  it("renders task content and priority", () => {
    render(
      <TaskList
        title="Due today"
        tasks={[{ id: "a1", content: "Ship the tests", priority: 2 }]}
        emptyLabel="Nothing"
        pendingTaskIds={[]}
      />,
    );
    expect(screen.getByText("Ship the tests")).toBeInTheDocument();
    expect(screen.getByText("P2")).toBeInTheDocument();
  });

  it("sorts due-today tasks like Todoist: same calendar day → higher API priority (P4 urgent) first", () => {
    render(
      <TaskList
        title="Today"
        tasks={[
          { id: "p4", content: "Low priority task", priority: 4, due: { date: "2026-03-25" } },
          { id: "p1", content: "Critical deadline", priority: 1, due: { date: "2026-03-25" } },
          { id: "p2", content: "Important task", priority: 2, due: { date: "2026-03-25" } },
        ]}
        emptyLabel="Nothing"
        pendingTaskIds={[]}
      />,
    );

    const orderedTitles = screen
      .getAllByText(/Critical deadline|Important task|Low priority task/)
      .map((node) => node.textContent);
    expect(orderedTitles).toEqual(["Low priority task", "Important task", "Critical deadline"]);
  });

  it("boosts tasks with deadline metadata above other near tasks", () => {
    render(
      <TaskList
        title="Today"
        tasks={[
          { id: "normal", content: "Regular p1", priority: 1, due: { date: "2099-03-25" } },
          {
            id: "deadline-flag",
            content: "Deadline-backed p4",
            priority: 4,
            due: { date: "2099-03-25" },
            deadline: { date: "2099-03-28" },
          },
          { id: "middle", content: "Regular p2", priority: 2, due: { date: "2099-03-25" } },
        ]}
        emptyLabel="Nothing"
        pendingTaskIds={[]}
      />,
    );

    const orderedTitles = screen
      .getAllByText(/Regular p1|Regular p2|Deadline-backed p4/)
      .map((node) => node.textContent);
    expect(orderedTitles).toEqual(["Deadline-backed p4", "Regular p2", "Regular p1"]);
  });

  it("calls onComplete when Complete is clicked", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(
      <TaskList
        title="Overdue"
        tasks={[{ id: "t99", content: "Close the loop", priority: 1 }]}
        emptyLabel="Nothing"
        pendingTaskIds={[]}
        onComplete={onComplete}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Complete" }));
    expect(onComplete).toHaveBeenCalledWith("t99");
  });

  it("opens defer menu and calls onSchedule", async () => {
    const user = userEvent.setup();
    const onSchedule = vi.fn().mockResolvedValue(undefined);
    render(
      <TaskList
        title="Overdue"
        tasks={[{ id: "t99", content: "Defer me", priority: 3 }]}
        emptyLabel="Nothing"
        pendingTaskIds={[]}
        onComplete={vi.fn().mockResolvedValue(undefined)}
        onSchedule={onSchedule}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open defer options" }));
    const menu = screen.getByRole("button", { name: "Open defer options" }).closest(".relative");
    expect(menu).toBeTruthy();
    const deferFocus = within(menu!.parentElement as HTMLElement).getByRole("button", {
      name: "Too big — need focus time",
    });
    await user.click(deferFocus);
    expect(onSchedule).toHaveBeenCalledWith("t99", "tomorrow at 9am", "Needs focus time or deep-work block");
  });
});
