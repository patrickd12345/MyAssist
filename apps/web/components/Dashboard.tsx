"use client";

import { useCallback, useState } from "react";
import {
  MYASSIST_CONTEXT_SOURCE_HEADER,
  type DailyContextSource,
} from "@/lib/fetchDailyContext";
import type { MyAssistDailyContext } from "@/lib/types";
import { AssistantConsole } from "./AssistantConsole";
import { TaskList } from "./TaskList";

type SectionKey =
  | "assistant"
  | "focus"
  | "triage"
  | "calendar"
  | "tasks"
  | "email";

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Toronto",
  }).format(d);
}

function countUrgentItems(data: MyAssistDailyContext): number {
  return data.todoist_overdue.length + data.todoist_due_today.length;
}

function nextMeetingLabel(data: MyAssistDailyContext): string {
  const nextEvent = data.calendar_today.find((item) => item.start);
  if (!nextEvent) return "No scheduled event in the current pull.";
  return `${nextEvent.summary} at ${formatWhen(nextEvent.start)}`;
}

function assistantHeadline(data: MyAssistDailyContext): string {
  const urgent = countUrgentItems(data);
  if (urgent > 10) return "Today is heavy. Triage first, then protect execution time.";
  if (urgent > 0) return "You have real pressure today. Focus beats browsing.";
  if (data.gmail_signals.length > 0) return "Calendar is calm. Email is the main source of drift.";
  return "The system is quiet. This is a good time to push meaningful work.";
}

function assistantMoves(data: MyAssistDailyContext): string[] {
  const moves: string[] = [];
  if (data.todoist_overdue.length > 0) {
    const top = data.todoist_overdue[0];
    if (typeof top.content === "string") {
      moves.push(`Close the oldest overdue item first: ${top.content}.`);
    }
  }
  if (data.todoist_due_today.length > 0) {
    const top = data.todoist_due_today[0];
    if (typeof top.content === "string") {
      moves.push(`Block time for the due-today task: ${top.content}.`);
    }
  }
  if (data.calendar_today.length > 0) {
    moves.push(`Anchor your day around ${nextMeetingLabel(data)}.`);
  }
  if (data.gmail_signals.length > 0) {
    moves.push("Clear the highest-signal email thread before context switching spreads.");
  }
  return moves.slice(0, 3);
}

function todayPosture(data: MyAssistDailyContext): string {
  const urgent = countUrgentItems(data);
  const events = data.calendar_today.length;
  const signals = data.gmail_signals.length;

  if (urgent >= 8) {
    return "Recovery mode. Reduce commitments, close overdue loops, and protect one block for real work.";
  }
  if (events >= 5 && signals >= 5) {
    return "High-friction day. Meetings and inbound pressure can easily scatter attention.";
  }
  if (urgent > 0 || signals > 0) {
    return "Mixed pressure. You do not need a reset, but you do need a sharper order of attack.";
  }
  return "Clear runway. Use the quiet to move something important instead of grazing on admin.";
}

function pressureLevel(data: MyAssistDailyContext): string {
  const score =
    countUrgentItems(data) * 3 + Math.min(data.gmail_signals.length, 6) + Math.min(data.calendar_today.length, 6);
  if (score >= 28) return "High";
  if (score >= 14) return "Medium";
  return "Low";
}

function pressureColor(level: string): string {
  if (level === "High") return "pill-destructive";
  if (level === "Medium") return "pill-warning";
  return "pill-success";
}

function briefingNarrative(data: MyAssistDailyContext): string {
  const firstEvent = data.calendar_today.find((item) => item.start)?.summary;
  const firstOverdue = data.todoist_overdue[0];
  const topThread = data.gmail_signals[0];
  const parts: string[] = [];

  if (firstOverdue && typeof firstOverdue.content === "string") {
    parts.push(`The first drag on the day is "${firstOverdue.content}."`);
  }
  if (firstEvent) {
    parts.push(`Your schedule is anchored by ${firstEvent}.`);
  }
  if (topThread?.subject) {
    parts.push(`Email pressure is led by "${topThread.subject}".`);
  }
  if (parts.length === 0) {
    parts.push("The current pull is calm enough to work proactively instead of defensively.");
  }

  return parts.join(" ");
}

function focusLanes(data: MyAssistDailyContext): Array<{ label: string; title: string; detail: string }> {
  const lanes: Array<{ label: string; title: string; detail: string }> = [];
  const overdue = data.todoist_overdue[0];
  const dueToday = data.todoist_due_today[0];
  const meeting = data.calendar_today.find((item) => item.start);
  const thread = data.gmail_signals[0];

  if (overdue && typeof overdue.content === "string") {
    lanes.push({
      label: "Rescue",
      title: overdue.content,
      detail: "Oldest overdue item. Clear it before taking on fresh commitments.",
    });
  }

  if (dueToday && typeof dueToday.content === "string") {
    lanes.push({
      label: "Commit",
      title: dueToday.content,
      detail: "Due today. Protect time for it before the day fragments.",
    });
  }

  if (meeting?.summary) {
    lanes.push({
      label: "Anchor",
      title: meeting.summary,
      detail: `Next scheduled anchor is ${formatWhen(meeting.start)}.`,
    });
  }

  if (thread?.subject) {
    lanes.push({
      label: "Signal",
      title: thread.subject,
      detail: `Top visible email thread from ${firstName(thread.from)}.`,
    });
  }

  return lanes.slice(0, 4);
}

function taskTitle(task: Record<string, unknown> | undefined): string | null {
  if (!task) return null;
  return typeof task.content === "string" ? task.content : null;
}

function triageBoard(data: MyAssistDailyContext): Array<{
  label: "Do now" | "Defer" | "Watch";
  tone: string;
  title: string;
  detail: string;
}> {
  const board: Array<{
    label: "Do now" | "Defer" | "Watch";
    tone: string;
    title: string;
    detail: string;
  }> = [];

  const overdue = taskTitle(data.todoist_overdue[0]);
  const dueToday = taskTitle(data.todoist_due_today[0]);
  const firstMeeting = data.calendar_today.find((item) => item.start);
  const firstThread = data.gmail_signals[0];

  board.push({
    label: "Do now",
    tone: "tone-hot",
    title: overdue ?? dueToday ?? "Protect one high-value work block",
    detail: overdue
      ? "This is already late. Closing it buys back trust and mental bandwidth."
      : dueToday
        ? "This lands today. Put it on calendar before meetings and email eat the day."
        : "No task fire is obvious right now, so create momentum intentionally.",
  });

  board.push({
    label: "Defer",
    tone: "tone-soft",
    title: data.gmail_signals.length > 5 ? "Do not let the inbox set the agenda" : "Keep admin in a contained window",
    detail:
      data.gmail_signals.length > 5
        ? "There is visible inbound pressure, but not every thread deserves immediate attention."
        : "Low-grade maintenance work should stay batched instead of leaking across the day.",
  });

  board.push({
    label: "Watch",
    tone: "tone-calm",
    title: firstMeeting?.summary ?? firstThread?.subject ?? "The schedule is currently stable",
    detail: firstMeeting?.summary
      ? `Next live constraint is ${formatWhen(firstMeeting.start)}.`
      : firstThread?.subject
        ? `Top visible thread is from ${firstName(firstThread.from)}.`
        : "No obvious live constraint surfaced in this pull.",
  });

  return board;
}

function firstName(from: string): string {
  const cleaned = from.replace(/".*?"/g, "").replace(/<.*?>/g, "").trim();
  return cleaned || from;
}

function SectionToggle({
  collapsed,
  onClick,
}: {
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`transition-transform ${collapsed ? "" : "rotate-90"}`}
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
      {collapsed ? "Expand" : "Collapse"}
    </button>
  );
}

function lanePillColor(label: string): string {
  switch (label) {
    case "Rescue":
      return "pill-destructive";
    case "Commit":
      return "pill-warning";
    case "Anchor":
      return "pill-accent";
    case "Signal":
      return "pill-success";
    default:
      return "pill-accent";
  }
}

function triagePillColor(label: string): string {
  switch (label) {
    case "Do now":
      return "pill-destructive";
    case "Defer":
      return "pill-warning";
    case "Watch":
      return "pill-success";
    default:
      return "pill-accent";
  }
}

export function Dashboard({
  initialData,
  initialError,
  initialSource,
}: {
  initialData: MyAssistDailyContext | null;
  initialError: string | null;
  initialSource: DailyContextSource;
}) {
  const [data, setData] = useState<MyAssistDailyContext | null>(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [contextSource, setContextSource] = useState<DailyContextSource>(initialSource);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState<string[]>([]);
  const [taskActionError, setTaskActionError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<SectionKey, boolean>>({
    assistant: false,
    focus: false,
    triage: false,
    calendar: false,
    tasks: false,
    email: false,
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/daily-context", { cache: "no-store" });
      const headerSource = res.headers.get(MYASSIST_CONTEXT_SOURCE_HEADER);
      const j = (await res.json()) as { error?: string } & Partial<MyAssistDailyContext>;
      if (!res.ok) {
        setData(null);
        setError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      if ("error" in j && j.error) {
        setData(null);
        setError(j.error);
        return;
      }
      setContextSource(headerSource === "mock" ? "mock" : "n8n");
      setData(j as MyAssistDailyContext);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const copyJson = useCallback(async () => {
    if (!data) return;
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data]);

  const completeTask = useCallback(
    async (taskId: string) => {
      if (!data) return;

      const previous = data;
      setTaskActionError(null);
      setPendingTaskIds((current) => [...new Set([...current, taskId])]);
      setData({
        ...data,
        todoist_overdue: data.todoist_overdue.filter((task) => String(task.id ?? "") !== taskId),
        todoist_due_today: data.todoist_due_today.filter((task) => String(task.id ?? "") !== taskId),
        todoist_upcoming_high_priority: data.todoist_upcoming_high_priority.filter(
          (task) => String(task.id ?? "") !== taskId,
        ),
      });

      try {
        const response = await fetch(`/api/todoist/tasks/${encodeURIComponent(taskId)}/complete`, {
          method: "POST",
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? `HTTP ${response.status}`);
        }
      } catch (cause) {
        setData(previous);
        setTaskActionError(cause instanceof Error ? cause.message : "Could not complete the task.");
      } finally {
        setPendingTaskIds((current) => current.filter((value) => value !== taskId));
      }
    },
    [data],
  );

  const scheduleTask = useCallback(
    async (taskId: string, dueString: string) => {
      if (!data) return;

      const previous = data;
      setTaskActionError(null);
      setPendingTaskIds((current) => [...new Set([...current, taskId])]);
      setData({
        ...data,
        todoist_overdue: data.todoist_overdue.filter((task) => String(task.id ?? "") !== taskId),
        todoist_due_today: data.todoist_due_today.filter((task) => String(task.id ?? "") !== taskId),
        todoist_upcoming_high_priority: data.todoist_upcoming_high_priority.filter(
          (task) => String(task.id ?? "") !== taskId,
        ),
      });

      try {
        const response = await fetch(`/api/todoist/tasks/${encodeURIComponent(taskId)}/schedule`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ dueString, dueLang: "en" }),
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? `HTTP ${response.status}`);
        }
        await refresh();
      } catch (cause) {
        setData(previous);
        setTaskActionError(cause instanceof Error ? cause.message : "Could not reschedule the task.");
      } finally {
        setPendingTaskIds((current) => current.filter((value) => value !== taskId));
      }
    },
    [data, refresh],
  );

  const moves = data ? assistantMoves(data) : [];
  const lanes = data ? focusLanes(data) : [];
  const triage = data ? triageBoard(data) : [];
  const pressure = data ? pressureLevel(data) : "Low";

  const toggleSection = useCallback((key: SectionKey) => {
    setCollapsed((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

  return (
    <div className="mx-auto min-h-screen w-full max-w-[1800px] px-4 py-6 sm:px-6 xl:px-10 2xl:px-14">
      {/* Header */}
      <header className="mb-6">
        <div className="panel-elevated p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                </div>
                <span className="section-label">MyAssist Operator</span>
              </div>
              <h1 className="mt-3 max-w-2xl text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                A sharper operator view for your day, not another dead list.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                MyAssist reads like a human chief of staff: what matters, what is slipping, and what
                to attack next.
              </p>
              {data && (
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="chip rounded-md px-2.5 py-1 font-mono">
                    {data.run_date}
                  </span>
                  <span className="chip rounded-md px-2.5 py-1 font-mono">
                    {formatWhen(data.generated_at)}
                  </span>
                  <span className={`rounded-md px-2.5 py-1 font-medium ${contextSource === "mock" ? "pill-warning" : "pill-success"}`}>
                    {contextSource === "mock" ? "Demo feed" : "Live"}
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={loading}
                className="flex items-center gap-2 rounded-md border border-border bg-muted px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-border disabled:opacity-50"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={loading ? "animate-spin" : ""}
                >
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                {loading ? "Refreshing..." : "Refresh"}
              </button>
              <button
                type="button"
                onClick={() => void copyJson()}
                disabled={!data || loading}
                className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-50"
              >
                {copied ? "Copied" : "Copy payload"}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Briefing + Moves */}
      {data && !error && (
        <section className="mb-6 grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
          <div className="panel-elevated p-6">
            <p className="section-label">Assistant read</p>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {assistantHeadline(data)}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {briefingNarrative(data)}
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="panel-inset rounded-lg p-4">
                <p className="text-xs font-medium text-muted-foreground">Urgent load</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{countUrgentItems(data)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Overdue + due today</p>
              </div>
              <div className="panel-inset rounded-lg p-4">
                <p className="text-xs font-medium text-muted-foreground">Pressure</p>
                <div className="mt-2 flex items-center gap-2">
                  <p className="text-3xl font-semibold text-foreground">{pressure}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${pressureColor(pressure)}`}>
                    {pressure === "High" ? "Critical" : pressure === "Medium" ? "Active" : "Clear"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Email + task + calendar</p>
              </div>
              <div className="panel-inset rounded-lg p-4">
                <p className="text-xs font-medium text-muted-foreground">Posture</p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-foreground">{todayPosture(data)}</p>
              </div>
            </div>
          </div>
          <div className="panel p-6">
            <p className="section-label">Operator moves</p>
            <div className="mt-4 flex flex-col gap-2">
              {moves.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                  No urgent moves surfaced in the current snapshot.
                </p>
              ) : (
                moves.map((move, index) => (
                  <div
                    key={move}
                    className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3"
                  >
                    <span className="pill-accent mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold">
                      {index + 1}
                    </span>
                    <p className="text-sm leading-relaxed text-foreground">{move}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      {/* Assistant Console */}
      {data && !error && (
        <section className="mb-6">
          <div className="panel-elevated p-4">
            <div className="flex items-center justify-between gap-3 px-2 py-1">
              <div>
                <p className="section-label">Assistant channel</p>
                <p className="mt-1 text-sm text-muted-foreground">Interactive planning, task drafting, and challenge flow.</p>
              </div>
              <SectionToggle collapsed={collapsed.assistant} onClick={() => toggleSection("assistant")} />
            </div>
            {!collapsed.assistant ? (
              <div className="mt-2">
                <AssistantConsole context={data} />
              </div>
            ) : null}
          </div>
        </section>
      )}

      {/* Focus Lanes */}
      {data && !error && lanes.length > 0 && (
        <section className="mb-6">
          <div className="panel p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-label">Focus lanes</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                  Recommended attack order
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="chip rounded-md px-2.5 py-1 text-xs font-medium">
                  {lanes.length} lanes
                </span>
                <SectionToggle collapsed={collapsed.focus} onClick={() => toggleSection("focus")} />
              </div>
            </div>
            {!collapsed.focus ? (
              <div className="mt-5 grid gap-3 lg:grid-cols-4">
                {lanes.map((lane) => (
                  <div key={`${lane.label}-${lane.title}`} className="panel-inset rounded-lg px-4 py-4">
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${lanePillColor(lane.label)}`}>
                      {lane.label}
                    </span>
                    <p className="mt-3 text-sm font-semibold leading-relaxed text-foreground">{lane.title}</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{lane.detail}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      )}

      {/* Triage Board */}
      {data && !error && (
        <section className="mb-6">
          <div className="panel-elevated p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-label">Executive triage</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                  Do now, defer, and watch
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="chip rounded-md px-2.5 py-1 text-xs font-medium">
                  Auto-shaped from today&apos;s feed
                </span>
                <SectionToggle collapsed={collapsed.triage} onClick={() => toggleSection("triage")} />
              </div>
            </div>
            {!collapsed.triage ? (
              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                {triage.map((item) => (
                  <div key={item.label} className={`panel-inset rounded-lg px-4 py-4 ${item.tone}`}>
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${triagePillColor(item.label)}`}>
                      {item.label}
                    </span>
                    <p className="mt-3 text-base font-semibold leading-relaxed text-foreground">{item.title}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      )}

      {/* Demo mode banner */}
      {contextSource === "mock" && data && !error && (
        <div
          className="panel mb-6 border-warning/20 p-4 text-sm text-warning"
          role="status"
        >
          <p className="font-semibold">Demo mode is active</p>
          <p className="mt-1 text-xs leading-relaxed opacity-80">
            The interface is working, but the assistant is reading mock data because{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">MYASSIST_N8N_WEBHOOK_URL</code> is empty.
          </p>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="panel mb-6 border-destructive/20 p-5 text-sm text-destructive"
        >
          <p className="font-semibold">The assistant could not pull context.</p>
          <p className="mt-2 font-mono text-xs opacity-80">{error}</p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Check the active n8n webhook and the value of{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">MYASSIST_N8N_WEBHOOK_URL</code>, then refresh.
          </p>
        </div>
      )}

      {/* Task error */}
      {taskActionError && !error && (
        <div
          role="alert"
          className="panel mb-6 border-destructive/20 p-5 text-sm text-destructive"
        >
          <p className="font-semibold">Todoist write-back failed.</p>
          <p className="mt-2 text-xs leading-relaxed opacity-80">{taskActionError}</p>
        </div>
      )}

      {/* Calendar + Tasks + Email */}
      {data && (
        <div className="grid gap-4 2xl:grid-cols-[1.45fr_0.95fr]">
          <div className="flex flex-col gap-4">
            {/* Calendar */}
            <section className="panel-elevated p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="section-label">Timeline anchor</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                    Calendar horizon
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <span className="pill-accent rounded-md px-2 py-0.5 text-[11px] font-semibold">
                    {data.calendar_today.length} events
                  </span>
                  <SectionToggle collapsed={collapsed.calendar} onClick={() => toggleSection("calendar")} />
                </div>
              </div>
              {!collapsed.calendar ? (
                data.calendar_today.length === 0 ? (
                  <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                    No events in the current pull.
                  </p>
                ) : (
                  <ul className="mt-4 max-h-[32rem] flex flex-col gap-2 overflow-auto pr-1">
                    {data.calendar_today.map((ev) => (
                      <li
                        key={ev.id ?? `${ev.summary}-${ev.start}`}
                        className="panel-inset rounded-lg px-4 py-3"
                      >
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{ev.summary}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {formatWhen(ev.start)}
                              {ev.end ? ` \u2014 ${formatWhen(ev.end)}` : ""}
                            </p>
                          </div>
                          {ev.location ? (
                            <span className="chip max-w-full truncate rounded-md px-2 py-1 text-xs font-mono">
                              {ev.location}
                            </span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </section>

            {/* Task Decks */}
            <section className="panel p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="section-label">Task decks</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                    Action inventory
                  </h2>
                </div>
                <SectionToggle collapsed={collapsed.tasks} onClick={() => toggleSection("tasks")} />
              </div>
              {!collapsed.tasks ? (
                <div className="mt-5 grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <TaskList
                    title="Needs rescue"
                    tasks={data.todoist_overdue}
                    emptyLabel="Nothing overdue in this snapshot."
                    pendingTaskIds={pendingTaskIds}
                    onComplete={completeTask}
                    onSchedule={scheduleTask}
                  />
                  <TaskList
                    title="Today commitments"
                    tasks={data.todoist_due_today}
                    emptyLabel="Nothing due today in this snapshot."
                    pendingTaskIds={pendingTaskIds}
                    onComplete={completeTask}
                    onSchedule={scheduleTask}
                  />
                  <TaskList
                    title="Strategic backlog"
                    tasks={data.todoist_upcoming_high_priority}
                    emptyLabel="No high-priority undated tasks surfaced."
                    pendingTaskIds={pendingTaskIds}
                    onComplete={completeTask}
                    onSchedule={scheduleTask}
                  />
                </div>
              ) : null}
            </section>
          </div>

          {/* Email */}
          <section className="panel p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-label">Signal inbox</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                  Email pressure
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="pill-accent rounded-md px-2 py-0.5 text-[11px] font-semibold">
                  {data.gmail_signals.length} threads
                </span>
                <SectionToggle collapsed={collapsed.email} onClick={() => toggleSection("email")} />
              </div>
            </div>
            {!collapsed.email ? (
              data.gmail_signals.length === 0 ? (
                <p className="mt-5 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                  No messages matched the current signal query.
                </p>
              ) : (
                <ul className="mt-4 max-h-[44rem] flex flex-col gap-2 overflow-auto pr-1">
                  {data.gmail_signals.map((g) => (
                    <li
                      key={g.id ?? g.threadId ?? g.subject}
                      className="panel-inset rounded-lg px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {g.subject || "(no subject)"}
                        </p>
                        <p className="mt-1 text-xs font-medium text-muted-foreground">
                          {firstName(g.from)}
                        </p>
                        {g.snippet ? (
                          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {g.snippet}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
