"use client";

import { useRef, useState } from "react";
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
    timeZone: "America/Toronto",
  }).format(date);
}

function priorityLabel(priority: unknown): string {
  return typeof priority === "number" ? `P${priority}` : "P?";
}

function deferOptions(now: Date): Array<{ label: string; value: string }> {
  const options: Array<{ label: string; value: string }> = [];
  if (now.getHours() < 12) {
    options.push({ label: "Defer this afternoon", value: "today at 3pm" });
  }
  options.push({ label: "Defer tomorrow", value: "tomorrow at 9am" });
  options.push({ label: "Defer next week", value: "next monday at 9am" });
  return options;
}

export function TaskList({
  title,
  tasks,
  emptyLabel,
  pendingTaskIds = [],
  onComplete,
  onSchedule,
}: {
  title: string;
  tasks: TodoistTask[];
  emptyLabel: string;
  pendingTaskIds?: string[];
  onComplete?: (taskId: string) => Promise<void>;
  onSchedule?: (taskId: string, dueString: string) => Promise<void>;
}) {
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null);

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
      <h2 className="section-title mb-4 text-xs font-semibold text-[#7d604f]">
        {title}
      </h2>
      {tasks.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#cdb8a4] px-4 py-6 text-sm leading-6 text-[#7d604f]">
          {emptyLabel}
        </p>
      ) : (
        <ul className="max-h-[30rem] space-y-3 overflow-auto pr-1 text-sm">
          {tasks.map((task, index) => {
            const id =
              typeof task.id === "string" || typeof task.id === "number"
                ? String(task.id)
                : `idx-${index}`;
            const canComplete = Boolean(onComplete) && !id.startsWith("idx-");
            const isPending = pendingTaskIds.includes(id);
            const isMenuOpen = menuTaskId === id;
            return (
              <li key={id} className="list-card rounded-[22px] px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium leading-6 text-[#22150d]">
                      {taskContent(task)}
                    </p>
                    <p className="mt-2 text-xs text-[#7d604f]">{formatDue(taskDue(task))}</p>
                  </div>
                  <span className="signal-pill shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold">
                    {priorityLabel(task.priority)}
                  </span>
                </div>
                {canComplete ? (
                  <div className="relative mt-4 flex justify-end">
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
                        className="rounded-full border border-[#d8c1ad] bg-white/70 px-3 py-2 text-xs font-semibold text-[#6b4a36] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isPending ? "Completing..." : "Complete"}
                      </button>
                      {onSchedule ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setMenuTaskId((current) => (current === id ? null : id))}
                          className="rounded-full border border-[#d8c1ad] bg-white/70 px-3 py-2 text-xs font-semibold text-[#6b4a36] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Open defer options"
                        >
                          Defer
                        </button>
                      ) : null}
                    </div>
                    {isMenuOpen && onSchedule ? (
                      <div className="absolute right-0 top-full z-20 mt-2 w-52 rounded-[20px] border border-[#d8c1ad] bg-[#fffaf4] p-2 shadow-[0_18px_48px_rgba(50,25,8,0.12)]">
                        {deferOptions(new Date()).map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            disabled={isPending}
                            onClick={() => {
                              setMenuTaskId(null);
                              void onSchedule(id, option.value);
                            }}
                            className="block w-full rounded-[14px] px-3 py-2 text-left text-xs font-medium text-[#6b4a36] transition hover:bg-[#f6ede1] disabled:opacity-50"
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
