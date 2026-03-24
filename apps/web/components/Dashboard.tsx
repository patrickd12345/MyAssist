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

  const toggleSection = useCallback((key: SectionKey) => {
    setCollapsed((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

  return (
    <div className="mx-auto min-h-screen w-full max-w-[1800px] px-4 py-8 sm:px-6 xl:px-10 2xl:px-14">
      <header className="hero-glow mb-8">
        <div className="glass-panel-strong rounded-[34px] px-6 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="section-title text-xs font-semibold text-[#8a654f]">MyAssist operator</p>
              <h1 className="mt-3 max-w-2xl text-balance text-4xl font-semibold tracking-[-0.04em] text-[#1e120c] sm:text-5xl">
                A sharper operator view for your day, not another dead list.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#6f5f50] sm:text-lg">
                MyAssist should read like a human chief of staff: what matters, what is slipping, and what
                to attack next, all grounded in the same n8n payload.
              </p>
              {data && (
                <div className="mt-5 flex flex-wrap gap-3 text-sm text-[#6f5f50]">
                  <span className="metric-chip rounded-full px-3 py-1.5 font-medium">
                    Run {data.run_date}
                  </span>
                  <span className="metric-chip rounded-full px-3 py-1.5 font-medium">
                    Generated {formatWhen(data.generated_at)}
                  </span>
                  <span className="metric-chip rounded-full px-3 py-1.5 font-medium">
                    Source {contextSource === "mock" ? "Demo feed" : "Live n8n feed"}
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-3 xl:justify-end">
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={loading}
                className="rounded-full border border-[#c7aa92] bg-white/70 px-5 py-3 text-sm font-semibold text-[#23150d] transition hover:bg-white disabled:opacity-50"
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
              <button
                type="button"
                onClick={() => void copyJson()}
                disabled={!data || loading}
                className="rounded-full bg-[#1f140f] px-5 py-3 text-sm font-semibold text-[#fff7ef] transition hover:bg-[#2b1a11] disabled:opacity-50"
              >
                {copied ? "Copied" : "Copy briefing payload"}
              </button>
            </div>
          </div>
        </div>
      </header>

      {data && !error && (
        <section className="mb-8 grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
          <div className="glass-panel-strong rounded-[30px] p-6">
            <p className="section-title text-xs font-semibold text-[#8a654f]">Assistant read</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#1f130c]">
              {assistantHeadline(data)}
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[#6f5f50]">{briefingNarrative(data)}</p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="metric-chip rounded-[22px] p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#8a654f]">Urgent load</p>
                <p className="mt-2 text-3xl font-semibold text-[#20140c]">{countUrgentItems(data)}</p>
                <p className="mt-1 text-sm text-[#6f5f50]">Overdue plus due today.</p>
              </div>
              <div className="metric-chip rounded-[22px] p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#8a654f]">Pressure</p>
                <p className="mt-2 text-3xl font-semibold text-[#20140c]">{pressureLevel(data)}</p>
                <p className="mt-1 text-sm text-[#6f5f50]">Combined email, task, and calendar drag.</p>
              </div>
              <div className="metric-chip rounded-[22px] p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#8a654f]">Posture</p>
                <p className="mt-2 text-lg font-semibold leading-6 text-[#20140c]">{todayPosture(data)}</p>
              </div>
            </div>
          </div>
          <div className="glass-panel rounded-[30px] p-6">
            <p className="section-title text-xs font-semibold text-[#8a654f]">Operator moves</p>
            <div className="mt-4 space-y-3">
              {moves.length === 0 ? (
                <p className="rounded-[22px] border border-dashed border-[#cdb8a4] px-4 py-5 text-sm text-[#7d604f]">
                  No urgent moves surfaced in the current snapshot.
                </p>
              ) : (
                moves.map((move, index) => (
                  <div
                    key={move}
                    className="list-card flex items-start gap-3 rounded-[22px] px-4 py-4"
                  >
                    <span className="signal-pill mt-0.5 rounded-full px-2.5 py-1 text-[11px] font-semibold">
                      0{index + 1}
                    </span>
                    <p className="text-sm leading-6 text-[#22150d]">{move}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      {data && !error && (
        <section className="mb-8">
          <div className="glass-panel-strong rounded-[32px] p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3 rounded-[24px] px-3 py-2 sm:px-4">
              <div>
                <p className="section-title text-xs font-semibold text-[#8a654f]">Assistant channel</p>
                <p className="mt-1 text-sm text-[#6f5f50]">Interactive planning, task drafting, and challenge flow.</p>
              </div>
              <button
                type="button"
                onClick={() => toggleSection("assistant")}
                className="metric-chip rounded-full px-4 py-2 text-xs font-semibold text-[#6b4a36]"
              >
                {collapsed.assistant ? "Expand" : "Compress"}
              </button>
            </div>
            {!collapsed.assistant ? (
              <div className="mt-2">
                <AssistantConsole context={data} />
              </div>
            ) : null}
          </div>
        </section>
      )}

      {data && !error && lanes.length > 0 && (
        <section className="mb-8">
          <div className="glass-panel rounded-[30px] p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-title text-xs font-semibold text-[#8a654f]">Focus lanes</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#20140c]">
                  The assistant&apos;s recommended attack order
                </h2>
              </div>
              <span className="metric-chip rounded-full px-3 py-1.5 text-xs font-medium text-[#7d604f]">
                {lanes.length} lanes
              </span>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => toggleSection("focus")}
                className="metric-chip rounded-full px-4 py-2 text-xs font-semibold text-[#6b4a36]"
              >
                {collapsed.focus ? "Expand" : "Compress"}
              </button>
            </div>
            {!collapsed.focus ? (
              <div className="mt-5 grid gap-3 lg:grid-cols-4">
                {lanes.map((lane) => (
                  <div key={`${lane.label}-${lane.title}`} className="list-card rounded-[24px] px-4 py-5">
                    <span className="signal-pill rounded-full px-2.5 py-1 text-[11px] font-semibold">
                      {lane.label}
                    </span>
                    <p className="mt-4 text-base font-semibold leading-6 text-[#20140c]">{lane.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[#6f5f50]">{lane.detail}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      )}

      {data && !error && (
        <section className="mb-8">
          <div className="glass-panel-strong rounded-[30px] p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-title text-xs font-semibold text-[#8a654f]">Executive triage</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#20140c]">
                  Do now, defer, and watch
                </h2>
              </div>
              <span className="metric-chip rounded-full px-3 py-1.5 text-xs font-medium text-[#7d604f]">
                Auto-shaped from today&apos;s feed
              </span>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => toggleSection("triage")}
                className="metric-chip rounded-full px-4 py-2 text-xs font-semibold text-[#6b4a36]"
              >
                {collapsed.triage ? "Expand" : "Compress"}
              </button>
            </div>
            {!collapsed.triage ? (
              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                {triage.map((item) => (
                  <div key={item.label} className={`list-card rounded-[24px] px-4 py-5 ${item.tone}`}>
                    <span className="signal-pill rounded-full px-2.5 py-1 text-[11px] font-semibold">
                      {item.label}
                    </span>
                    <p className="mt-4 text-lg font-semibold leading-6 text-[#20140c]">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[#6f5f50]">{item.detail}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      )}

      {contextSource === "mock" && data && !error && (
        <div
          className="glass-panel mb-8 rounded-[24px] border-[#9cc8d4] p-4 text-sm text-[#0e5163]"
          role="status"
        >
          <p className="font-semibold">Demo mode is active.</p>
          <p className="mt-1 text-xs leading-6 opacity-90">
            The interface is working, but the assistant is reading mock data because{" "}
            <code className="rounded bg-white/60 px-1.5 py-0.5">MYASSIST_N8N_WEBHOOK_URL</code> is empty.
          </p>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="glass-panel mb-8 rounded-[24px] border-[#d4b49c] p-5 text-sm text-[#5b2d13]"
        >
          <p className="font-semibold">The assistant could not pull context.</p>
          <p className="mt-2 font-mono text-xs opacity-90">{error}</p>
          <p className="mt-3 text-xs leading-6">
            Check the active n8n webhook and the value of{" "}
            <code className="rounded bg-white/60 px-1.5 py-0.5">MYASSIST_N8N_WEBHOOK_URL</code>, then refresh.
          </p>
        </div>
      )}

      {taskActionError && !error && (
        <div
          role="alert"
          className="glass-panel mb-8 rounded-[24px] border-[#d4b49c] p-5 text-sm text-[#5b2d13]"
        >
          <p className="font-semibold">Todoist write-back failed.</p>
          <p className="mt-2 text-xs leading-6 opacity-90">{taskActionError}</p>
        </div>
      )}

      {data && (
        <div className="grid gap-6 2xl:grid-cols-[1.45fr_0.95fr]">
          <div className="space-y-6">
            <section className="glass-panel-strong rounded-[30px] p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="section-title text-xs font-semibold text-[#8a654f]">Timeline anchor</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#20140c]">
                    Calendar horizon
                  </h2>
                </div>
                <span className="signal-pill rounded-full px-3 py-1.5 text-[11px] font-semibold">
                  {data.calendar_today.length} events
                </span>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => toggleSection("calendar")}
                  className="metric-chip rounded-full px-4 py-2 text-xs font-semibold text-[#6b4a36]"
                >
                  {collapsed.calendar ? "Expand" : "Compress"}
                </button>
              </div>
              {!collapsed.calendar ? (
                data.calendar_today.length === 0 ? (
                  <p className="mt-4 rounded-[22px] border border-dashed border-[#cdb8a4] px-4 py-6 text-sm text-[#7d604f]">
                    No events in the current pull.
                  </p>
                ) : (
                  <ul className="mt-5 max-h-[32rem] space-y-3 overflow-auto pr-1">
                    {data.calendar_today.map((ev) => (
                      <li
                        key={ev.id ?? `${ev.summary}-${ev.start}`}
                        className="list-card rounded-[24px] px-4 py-4"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-base font-semibold text-[#20140c]">{ev.summary}</p>
                            <p className="mt-1 text-sm text-[#6f5f50]">
                              {formatWhen(ev.start)}
                              {ev.end ? ` to ${formatWhen(ev.end)}` : ""}
                            </p>
                          </div>
                          {ev.location ? (
                            <span className="metric-chip max-w-full rounded-full px-3 py-1.5 text-xs font-medium text-[#7d604f]">
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

            <section className="glass-panel rounded-[30px] p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="section-title text-xs font-semibold text-[#8a654f]">Task decks</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#20140c]">
                    Action inventory
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSection("tasks")}
                  className="metric-chip rounded-full px-4 py-2 text-xs font-semibold text-[#6b4a36]"
                >
                  {collapsed.tasks ? "Expand" : "Compress"}
                </button>
              </div>
              {!collapsed.tasks ? (
                <div className="mt-5 grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
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

          <section className="glass-panel rounded-[30px] p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-title text-xs font-semibold text-[#8a654f]">Signal inbox</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#20140c]">
                  Email pressure
                </h2>
              </div>
              <span className="signal-pill rounded-full px-3 py-1.5 text-[11px] font-semibold">
                {data.gmail_signals.length} threads
              </span>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => toggleSection("email")}
                className="metric-chip rounded-full px-4 py-2 text-xs font-semibold text-[#6b4a36]"
              >
                {collapsed.email ? "Expand" : "Compress"}
              </button>
            </div>
            {!collapsed.email ? (
              data.gmail_signals.length === 0 ? (
                <p className="mt-5 rounded-[22px] border border-dashed border-[#cdb8a4] px-4 py-6 text-sm text-[#7d604f]">
                  No messages matched the current signal query.
                </p>
              ) : (
                <ul className="mt-5 max-h-[44rem] space-y-3 overflow-auto pr-1">
                  {data.gmail_signals.map((g) => (
                    <li
                      key={g.id ?? g.threadId ?? g.subject}
                      className="list-card rounded-[24px] px-4 py-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#20140c]">
                          {g.subject || "(no subject)"}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#8a654f]">
                          {firstName(g.from)}
                        </p>
                        {g.snippet ? (
                          <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#6f5f50]">
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
