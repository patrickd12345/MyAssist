"use client";

import { useMemo, useRef, useState } from "react";
import { compareTasksTodoistOrder, DEFAULT_TASK_DAY_TIMEZONE } from "@/lib/todoistTaskBuckets";
import type { TodoistTask } from "@/lib/types";

function taskContent(task: TodoistTask): string {
  return typeof task.content === "string" ? task.content : "Untitled task";
}

function taskDue(task: TodoistTask): string | null {
  const due = task.due as { date?: string; datetime?: string } | undefined;
  return due?.datetime ?? due?.date ?? null;
}

function formatDue(value: string | null): string {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    hour: value.includes("T") ? "numeric" : undefined,
    minute: value.includes("T") ? "2-digit" : undefined,
    hour12: true,
    timeZone: DEFAULT_TASK_DAY_TIMEZONE,
  }).format(date);
}

function priorityLabel(priority: unknown): string {
  return typeof priority === "number" ? `P${priority}` : "P?";
}

export type DeferOption = { label: string; value: string; intent: string };

function deferOptions(now: Date): DeferOption[] {
  const options: DeferOption[] = [];
  if (now.getHours() < 12) {
    options.push({
      label: "Later today (afternoon)",
      value: "today at 3pm",
      intent: "Prefer later today",
    });
  }
  options.push({
    label: "Too big — need focus time",
    value: "tomorrow at 9am",
    intent: "Needs focus time or deep-work block",
  });
  options.push({
    label: "Waiting on someone else",
    value: "tomorrow at 9am",
    intent: "Blocked on external reply or dependency",
  });
  options.push({
    label: "Not a priority this week",
    value: "in 7 days at 9am",
    intent: "Low priority — slipped one week",
  });
  return options;
}

export function TaskList({
  title,
  tasks,
  emptyLabel,
  pendingTaskIds = [],
  nudges = {},
  onComplete,
  onSchedule,
  onNudge,
  onBlockCalendar,
  blockCalendarPendingKeys = [],
}: {
  title: string;
  tasks: TodoistTask[];
  emptyLabel: string;
  pendingTaskIds?: string[];
  nudges?: Record<string, "up" | "down">;
  onComplete?: (taskId: string) => Promise<void>;
  onSchedule?: (taskId: string, dueString: string, intent?: string) => Promise<void>;
  onNudge?: (taskId: string, direction: "up" | "down", taskText: string) => Promise<void>;
  onBlockCalendar?: (taskId: string) => Promise<void>;
  blockCalendarPendingKeys?: string[];
}) {
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null);
  const sortedTasks = useMemo(() => {
    const baseSorted = [...tasks].sort((a, b) =>
      compareTasksTodoistOrder(a as Record<string, unknown>, b as Record<string, unknown>),
    );

    // Apply nudges (one pass, up and down)
    const result = [...baseSorted];
    // Process "up" nudges (top to bottom to avoid cascading up infinitely if multiple)
    for (let i = 1; i < result.length; i++) {
      const taskId = String(result[i].id);
      if (nudges[taskId] === "up") {
        // Swap with the item above
        const temp = result[i - 1];
        result[i - 1] = result[i];
        result[i] = temp;
      }
    }
    // Process "down" nudges (bottom to top)
    for (let i = result.length - 2; i >= 0; i--) {
      const taskId = String(result[i].id);
      if (nudges[taskId] === "down") {
        // Swap with the item below
        const temp = result[i + 1];
        result[i + 1] = result[i];
        result[i] = temp;
      }
    }
    return result;
  }, [tasks, nudges]);

  function clearHoldTimer() {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function startHold(taskId: string) {
    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      setMenuTaskId(taskId);
      holdTimerRef.current = null;
    }, 450);
  }

  function cancelHold() {
    clearHoldTimer();
  }

  return (
    <section className="glass-panel min-w-[280px] self-start rounded-[28px] p-5">
      <h2 className="section-title mb-4 text-xs font-semibold">
        {title}
      </h2>
      {sortedTasks.length === 0 ? (
        <p className="theme-empty rounded-2xl px-4 py-6 text-sm leading-6">
          {emptyLabel}
        </p>
      ) : (
        <ul className="max-h-[30rem] space-y-3 overflow-auto pr-1 text-sm">
          {sortedTasks.map((task, index) => {
            const id =
              typeof task.id === "string" || typeof task.id === "number"
                ? String(task.id)
                : `idx-${index}`;
            const canComplete = Boolean(onComplete) && !id.startsWith("idx-");
            const isPending = pendingTaskIds.includes(id);
            const blockKey = `task_to_calendar_block:${id}`;
            const blockBusy = blockCalendarPendingKeys.includes(blockKey);
            const isMenuOpen = menuTaskId === id;
            return (
              <li key={id} className="list-card rounded-[22px] px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p
                      className="theme-ink break-words text-sm font-medium leading-6"
                      title={taskContent(task)}
                    >
                      {taskContent(task)}
                    </p>
                    <p className="theme-muted mt-2 text-xs">{formatDue(taskDue(task))}</p>
                  </div>
                  <span className="signal-pill shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold">
                    {priorityLabel(task.priority)}
                  </span>
                </div>
                {canComplete ? (
                  <div className="relative mt-4 flex justify-between items-center">
                    <div className="flex gap-1 opacity-40 hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        disabled={isPending || index === 0}
                        onClick={() => void onNudge?.(id, "up", taskContent(task))}
                        className="rounded px-2 py-1 text-[10px] hover:bg-black/5 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Bump up one slot (AI will learn this preference)"
                        aria-label="Move task up"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={isPending || index === sortedTasks.length - 1}
                        onClick={() => void onNudge?.(id, "down", taskContent(task))}
                        className="rounded px-2 py-1 text-[10px] hover:bg-black/5 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Bump down one slot (AI will learn this preference)"
                        aria-label="Move task down"
                      >
                        ▼
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          if (isMenuOpen) {
                            setMenuTaskId(null);
                            return;
                          }
                          void onComplete?.(id);
                        }}
                        onPointerDown={() => startHold(id)}
                        onPointerUp={cancelHold}
                        onPointerLeave={cancelHold}
                        onPointerCancel={cancelHold}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setMenuTaskId(id);
                        }}
                        className="theme-button-secondary rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isPending ? "Completing..." : "Complete"}
                      </button>
                      {onSchedule ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setMenuTaskId((current) => (current === id ? null : id))}
                          className="theme-button-secondary rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Open defer options"
                        >
                          Defer
                        </button>
                      ) : null}
                      {onBlockCalendar ? (
                        <button
                          type="button"
                          disabled={isPending || blockBusy}
                          onClick={() => void onBlockCalendar(id)}
                          className="theme-button-secondary rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                          title="Create a focus block on Google Calendar when the task has a due time"
                        >
                          {blockBusy ? "Calendar…" : "Block"}
                        </button>
                      ) : null}
                    </div>
                    {isMenuOpen && onSchedule ? (
                      <div className="theme-menu absolute right-0 top-full z-20 mt-2 w-64 max-w-[min(100vw-2rem,18rem)] rounded-[20px] p-2 shadow-[0_18px_48px_rgba(50,25,8,0.12)]">
                        {deferOptions(new Date()).map((option) => (
                          <button
                            key={`${option.value}|${option.intent}`}
                            type="button"
                            disabled={isPending}
                            onClick={() => {
                              setMenuTaskId(null);
                              void onSchedule(id, option.value, option.intent);
                            }}
                            className="theme-menu-item block w-full rounded-[14px] px-3 py-2 text-left text-xs font-medium transition disabled:opacity-50"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
