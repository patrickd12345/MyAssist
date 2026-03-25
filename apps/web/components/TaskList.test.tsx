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
    const deferTomorrow = within(menu!.parentElement as HTMLElement).getByRole("button", {
      name: "Defer tomorrow",
    });
    await user.click(deferTomorrow);
    expect(onSchedule).toHaveBeenCalledWith("t99", "tomorrow at 9am");
  });
});
