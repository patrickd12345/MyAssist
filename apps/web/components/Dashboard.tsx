"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildHeadlineFallback } from "@/lib/assistant";
import {
  MYASSIST_CONTEXT_SOURCE_HEADER,
  type DailyContextSource,
} from "@/lib/fetchDailyContext";
import type { MyAssistDailyContext, GmailSignal, SituationBrief, TodoistTask } from "@/lib/types";
import { AssistantConsole } from "./AssistantConsole";
import { TaskList } from "./TaskList";

type ThemeKey = "neon" | "kpop-demon-hunters";

const THEME_STORAGE_KEY = "myassist-theme";

const THEMES: Array<{ key: ThemeKey; label: string; note: string }> = [
  { key: "neon", label: "Neon", note: "Dark premium default" },
  { key: "kpop-demon-hunters", label: "K-pop Demon Hunters", note: "Stage energy" },
];

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

function firstName(from: string): string {
  const cleaned = from.replace(/".*?"/g, "").replace(/<.*?>/g, "").trim();
  return cleaned || from;
}

function taskTitle(task: Record<string, unknown> | undefined): string | null {
  if (!task) return null;
  return typeof task.content === "string" ? task.content : null;
}

function countUrgentItems(data: MyAssistDailyContext): number {
  return data.todoist_overdue.length + data.todoist_due_today.length;
}

function pressureLevel(data: MyAssistDailyContext): "Low" | "Medium" | "High" {
  const score =
    countUrgentItems(data) * 3 +
    Math.min(data.gmail_signals.length, 5) +
    Math.min(data.calendar_today.length, 5);
  if (score >= 24) return "High";
  if (score >= 12) return "Medium";
  return "Low";
}

function buildNextAction(data: MyAssistDailyContext): {
  title: string;
  detail: string;
  cue: string;
} {
  const overdue = taskTitle(data.todoist_overdue[0]);
  if (overdue) {
    return {
      title: overdue,
      detail: "This is already late. Closing it buys back trust and mental bandwidth immediately.",
      cue: "Overdue task",
    };
  }

  const dueToday = taskTitle(data.todoist_due_today[0]);
  if (dueToday) {
    return {
      title: dueToday,
      detail: "This lands today. Put it on calendar before the rest of the day expands around it.",
      cue: "Due today",
    };
  }

  const nextEvent = data.calendar_today.find((item) => item.start);
  if (nextEvent?.summary) {
    return {
      title: `Prepare for ${nextEvent.summary}`,
      detail: `Next anchor is ${formatWhen(nextEvent.start)}. Use the time before it with intent.`,
      cue: "Calendar anchor",
    };
  }

  const thread = data.gmail_signals[0];
  if (thread?.subject) {
    return {
      title: thread.subject,
      detail: `Top visible thread is from ${firstName(thread.from)}. Handle it before the inbox multiplies.`,
      cue: "Important email",
    };
  }

  return {
    title: "Protect one meaningful work block",
    detail: "No obvious fire surfaced in this pull. Use the runway for work that actually matters.",
    cue: "Clear runway",
  };
}

function summarizeEmails(signals: GmailSignal[]): string {
  if (signals.length === 0) return "No important email surfaced in the current pull.";
  const sender = firstName(signals[0].from);
  if (signals.length === 1) return `One visible thread, led by ${sender}.`;
  return `${signals.length} visible threads. Lead sender: ${sender}.`;
}

function formatRunDate(data: MyAssistDailyContext): string {
  return `Run ${data.run_date} · Generated ${formatWhen(data.generated_at)}`;
}

function taskCountLabel(tasks: TodoistTask[]): string {
  return tasks.length === 1 ? "1 task" : `${tasks.length} tasks`;
}

function MetricValue({
  value,
  href,
  label,
}: {
  value: number | string;
  href?: string;
  label: string;
}) {
  const className =
    "theme-ink mt-2 text-3xl font-semibold transition hover:opacity-80 focus-visible:opacity-80 focus-visible:outline-none";

  if (!href) {
    return <p className={className}>{value}</p>;
  }

  return (
    <a href={href} className={`${className} inline-block`} aria-label={label}>
      {value}
    </a>
  );
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
  const [theme, setTheme] = useState<ThemeKey>("neon");
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [headline, setHeadline] = useState<string>(
    initialData ? buildHeadlineFallback(initialData) : "MyAssist is getting your day ready.",
  );
  const [situationBrief, setSituationBrief] = useState<SituationBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefFeedbackState, setBriefFeedbackState] = useState<"idle" | "sending" | "saved">("idle");
  const lastHeadlineKeyRef = useRef<string | null>(initialData?.generated_at ?? null);

  useEffect(() => {
    const storedTheme =
      typeof window !== "undefined" ? window.localStorage.getItem(THEME_STORAGE_KEY) : null;
    if (storedTheme === "neon" || storedTheme === "kpop-demon-hunters") {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);

    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);

  useEffect(() => {
    if (!data) {
      setHeadline("MyAssist is getting your day ready.");
      setSituationBrief(null);
      setBriefError(null);
      lastHeadlineKeyRef.current = null;
      return;
    }

    const headlineKey = `${data.run_date}:${data.generated_at}`;
    if (lastHeadlineKeyRef.current === headlineKey) {
      return;
    }

    lastHeadlineKeyRef.current = headlineKey;
    let cancelled = false;
    setHeadline(buildHeadlineFallback(data));

    const loadHeadline = async () => {
      try {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            kind: "headline",
            context: data,
          }),
        });

        const body = (await response.json()) as { answer?: string; error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? `HTTP ${response.status}`);
        }

        if (!cancelled && typeof body.answer === "string" && body.answer.trim()) {
          setHeadline(body.answer.trim());
        }
      } catch {
        if (!cancelled) {
          setHeadline(buildHeadlineFallback(data));
        }
      }
    };

    void loadHeadline();

    return () => {
      cancelled = true;
    };
  }, [data]);

  useEffect(() => {
    if (!data) {
      setSituationBrief(null);
      return;
    }
    let cancelled = false;
    setBriefLoading(true);
    setBriefError(null);
    setBriefFeedbackState("idle");
    const loadBrief = async () => {
      try {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            kind: "situation_brief",
            context: data,
          }),
        });
        const body = (await response.json()) as { brief?: SituationBrief; error?: string };
        if (!response.ok || !body.brief) {
          throw new Error(body.error ?? `HTTP ${response.status}`);
        }
        if (!cancelled) {
          setSituationBrief(body.brief);
        }
      } catch (cause) {
        if (!cancelled) {
          setSituationBrief(null);
          setBriefError(cause instanceof Error ? cause.message : "Could not load the situation brief.");
        }
      } finally {
        if (!cancelled) {
          setBriefLoading(false);
        }
      }
    };
    void loadBrief();
    return () => {
      cancelled = true;
    };
  }, [data]);

  const sendBriefFeedback = useCallback(
    async (rating: "useful" | "needs_work") => {
      if (!data) return;
      setBriefFeedbackState("sending");
      try {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            kind: "situation_feedback",
            run_date: data.run_date,
            rating,
          }),
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? `HTTP ${response.status}`);
        }
        setBriefFeedbackState("saved");
      } catch {
        setBriefFeedbackState("idle");
      }
    },
    [data],
  );

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
          headers: { "Content-Type": "application/json" },
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

  const nextAction = useMemo(() => (data ? buildNextAction(data) : null), [data]);

  return (
    <div className="theme-shell mx-auto min-h-screen w-full max-w-[1900px] px-4 py-6 sm:px-6 xl:px-8 2xl:px-10">
      <section className="glass-panel-strong mb-6 rounded-[32px] px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="signal-pill rounded-full px-3 py-1 text-[11px] font-semibold">
                MyAssist
              </span>
              {data ? (
                <span className="theme-chip rounded-full px-3 py-1 text-xs font-medium">
                  {contextSource === "mock" ? "Demo feed" : "Live n8n feed"}
                </span>
              ) : null}
            </div>
            <h1 className="theme-ink mt-4 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              {data ? (
                <>
                  <span className="theme-muted block text-lg font-medium leading-snug sm:text-xl">
                    Welcome back.
                  </span>
                  <span className="mt-2 block">{headline}</span>
                </>
              ) : (
                "Welcome back. MyAssist is getting your day ready."
              )}
            </h1>
            <p className="theme-muted mt-3 max-w-3xl text-sm leading-7 sm:text-base">
              {data
                ? formatRunDate(data)
                : "Live daily context from n8n, with tasks, calendar, email, and assistant actions in one place."}
            </p>
          </div>

          <div className="flex flex-col gap-3 xl:min-w-[340px] xl:items-end">
            <div className="theme-selector relative">
              <button
                type="button"
                onClick={() => setThemeMenuOpen((current) => !current)}
                className="theme-toggle rounded-full px-4 py-2 text-xs font-semibold transition"
                aria-haspopup="menu"
                aria-expanded={themeMenuOpen}
              >
                Theme: {THEMES.find((option) => option.key === theme)?.label ?? "Neon"}
              </button>
              {themeMenuOpen ? (
                <div className="theme-menu absolute right-0 z-30 mt-2 w-64 rounded-[22px] p-2">
                  {THEMES.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => {
                        setTheme(option.key);
                        setThemeMenuOpen(false);
                      }}
                      className={`theme-menu-item block w-full rounded-[16px] px-3 py-3 text-left transition ${
                        theme === option.key ? "theme-toggle is-active" : ""
                      }`}
                    >
                      <span className="block text-sm font-semibold">{option.label}</span>
                      <span className="theme-muted block text-xs">{option.note}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3 xl:justify-end">
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={loading}
                className="theme-button-secondary rounded-full px-5 py-3 text-sm font-semibold transition disabled:opacity-50"
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
              <button
                type="button"
                onClick={() => void copyJson()}
                disabled={!data || loading}
                className="theme-button-primary rounded-full px-5 py-3 text-sm font-semibold transition disabled:opacity-50"
              >
                {copied ? "Copied" : "Copy payload"}
              </button>
            </div>
          </div>
        </div>

        {data ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
            <div className="metric-chip rounded-[22px] px-4 py-4">
              <p className="theme-accent text-[11px] uppercase tracking-[0.18em]">What needs attention</p>
              <MetricValue
                value={countUrgentItems(data)}
                href="#tasks"
                label="Jump to tasks that need attention"
              />
              <p className="theme-muted mt-1 text-sm">Overdue plus due today.</p>
            </div>
            <div className="metric-chip rounded-[22px] px-4 py-4">
              <p className="theme-accent text-[11px] uppercase tracking-[0.18em]">Pressure</p>
              <MetricValue value={pressureLevel(data)} label="Current pressure level" />
              <p className="theme-muted mt-1 text-sm">Task, calendar, and email load.</p>
            </div>
            <div className="metric-chip rounded-[22px] px-4 py-4">
              <p className="theme-accent text-[11px] uppercase tracking-[0.18em]">Calendar</p>
              <MetricValue
                value={data.calendar_today.length}
                href="#calendar"
                label="Jump to calendar events"
              />
              <p className="theme-muted mt-1 text-sm">
                {data.calendar_today.length === 1 ? "Event today" : "Events in view"}
              </p>
            </div>
            <div className="metric-chip rounded-[22px] px-4 py-4">
              <p className="theme-accent text-[11px] uppercase tracking-[0.18em]">Important emails</p>
              <MetricValue
                value={data.gmail_signals.length}
                href="#important-emails"
                label="Jump to important emails"
              />
              <p className="theme-muted mt-1 text-sm">{summarizeEmails(data.gmail_signals)}</p>
            </div>
          </div>
        ) : null}
      </section>

      {contextSource === "mock" && data && !error && (
        <div className="glass-panel mb-6 rounded-[24px] border-blue-500/30 bg-blue-500/10 p-5 text-blue-100" role="status">
          <p className="font-semibold">Demo mode is active.</p>
          <p className="mt-1 text-xs leading-6 opacity-90">
            The interface is working, but the assistant is reading mock data because{" "}
            <code className="rounded bg-white/5 px-1.5 py-0.5">MYASSIST_N8N_WEBHOOK_URL</code> is empty.
          </p>
        </div>
      )}

      {error && (
        <div role="alert" className="glass-panel mb-6 rounded-[24px] border-red-500/30 p-5 text-sm text-red-300">
          <p className="font-semibold">The assistant could not pull context.</p>
          <p className="mt-2 font-mono text-xs opacity-90">{error}</p>
          <p className="mt-3 text-xs leading-6">
            Check the active n8n webhook and the value of{" "}
            <code className="rounded bg-white/5 px-1.5 py-0.5">MYASSIST_N8N_WEBHOOK_URL</code>, then refresh.
          </p>
        </div>
      )}

      {taskActionError && !error && (
        <div role="alert" className="glass-panel mb-6 rounded-[24px] border-red-500/30 p-5 text-sm text-red-300">
          <p className="font-semibold">Todoist write-back failed.</p>
          <p className="mt-2 text-xs leading-6 opacity-90">{taskActionError}</p>
        </div>
      )}

      {data ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.9fr)]">
          <div className="space-y-6">
            {nextAction ? (
              <section className="glass-panel-strong rounded-[30px] p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-3xl">
                    <p className="section-title text-xs font-semibold">Do this next</p>
                    <h2 className="theme-ink mt-3 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
                      {nextAction.title}
                    </h2>
                    <p className="theme-muted mt-3 text-sm leading-7 sm:text-base">{nextAction.detail}</p>
                  </div>
                  <span className="signal-pill rounded-full px-3 py-1.5 text-xs font-semibold">
                    {nextAction.cue}
                  </span>
                </div>
              </section>
            ) : null}

            <section className="glass-panel rounded-[30px] p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <p className="section-title text-xs font-semibold">Situation brief</p>
                  <h2 className="theme-ink mt-2 text-2xl font-semibold tracking-[-0.03em]">
                    AI synthesis across tasks, calendar, and email
                  </h2>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void sendBriefFeedback("useful")}
                    disabled={briefFeedbackState === "sending" || !situationBrief}
                    className="theme-button-secondary rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    Useful
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendBriefFeedback("needs_work")}
                    disabled={briefFeedbackState === "sending" || !situationBrief}
                    className="theme-button-secondary rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    Needs work
                  </button>
                </div>
              </div>
              {briefLoading ? (
                <p className="theme-muted mt-4 text-sm">Building situation brief...</p>
              ) : briefError ? (
                <p className="theme-empty mt-4 rounded-[20px] px-4 py-5 text-sm">{briefError}</p>
              ) : situationBrief ? (
                <div className="mt-5 space-y-4 text-sm">
                  <div className="list-card rounded-[22px] px-4 py-4">
                    <p className="theme-accent text-[11px] uppercase tracking-[0.14em]">Pressure</p>
                    <p className="theme-ink mt-2 leading-6">{situationBrief.pressure_summary}</p>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="list-card rounded-[22px] px-4 py-4">
                      <p className="theme-accent text-[11px] uppercase tracking-[0.14em]">Top priorities</p>
                      <ul className="theme-ink mt-2 space-y-2">
                        {situationBrief.top_priorities.map((item, idx) => (
                          <li key={`priority-${idx}`} className="leading-6">{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="list-card rounded-[22px] px-4 py-4">
                      <p className="theme-accent text-[11px] uppercase tracking-[0.14em]">Risks</p>
                      <ul className="theme-ink mt-2 space-y-2">
                        {situationBrief.conflicts_and_risks.map((item, idx) => (
                          <li key={`risk-${idx}`} className="leading-6">{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="list-card rounded-[22px] px-4 py-4">
                      <p className="theme-accent text-[11px] uppercase tracking-[0.14em]">Defer</p>
                      <ul className="theme-ink mt-2 space-y-2">
                        {situationBrief.defer_recommendations.map((item, idx) => (
                          <li key={`defer-${idx}`} className="leading-6">{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="list-card rounded-[22px] px-4 py-4">
                      <p className="theme-accent text-[11px] uppercase tracking-[0.14em]">Next actions</p>
                      <ul className="theme-ink mt-2 space-y-2">
                        {situationBrief.next_actions.map((item, idx) => (
                          <li key={`action-${idx}`} className="leading-6">{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="list-card rounded-[22px] px-4 py-4">
                    <p className="theme-accent text-[11px] uppercase tracking-[0.14em]">Confidence and limits</p>
                    <p className="theme-muted mt-2 leading-6">{situationBrief.confidence_and_limits}</p>
                    {situationBrief.memory_insights.length > 0 ? (
                      <div className="mt-3">
                        <p className="theme-accent text-[11px] uppercase tracking-[0.14em]">Memory insights</p>
                        <ul className="theme-ink mt-2 space-y-2">
                          {situationBrief.memory_insights.map((item, idx) => (
                            <li key={`memory-${idx}`} className="leading-6">{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                  {briefFeedbackState === "saved" ? (
                    <p className="theme-muted text-xs">Feedback saved for future brief tuning.</p>
                  ) : null}
                </div>
              ) : (
                <p className="theme-muted mt-4 text-sm">No brief yet.</p>
              )}
            </section>

            <section id="tasks" className="glass-panel scroll-mt-6 rounded-[30px] p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="section-title text-xs font-semibold">Tasks</p>
                  <h2 className="theme-ink mt-2 text-2xl font-semibold tracking-[-0.03em]">
                    What needs attention
                  </h2>
                  <p className="theme-muted mt-2 text-sm leading-6">
                    Clear groups, explicit actions, and the same live Todoist behavior underneath.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="theme-chip rounded-full px-3 py-1.5 text-xs font-medium">
                    Overdue {taskCountLabel(data.todoist_overdue)}
                  </span>
                  <span className="theme-chip rounded-full px-3 py-1.5 text-xs font-medium">
                    Today {taskCountLabel(data.todoist_due_today)}
                  </span>
                  <span className="theme-chip rounded-full px-3 py-1.5 text-xs font-medium">
                    Backlog {taskCountLabel(data.todoist_upcoming_high_priority)}
                  </span>
                </div>
              </div>
              <div className="mt-6 grid items-start gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                <TaskList
                  title="Overdue"
                  tasks={data.todoist_overdue}
                  emptyLabel="Nothing overdue in this snapshot."
                  pendingTaskIds={pendingTaskIds}
                  onComplete={completeTask}
                  onSchedule={scheduleTask}
                />
                <TaskList
                  title="Today"
                  tasks={data.todoist_due_today}
                  emptyLabel="Nothing due today in this snapshot."
                  pendingTaskIds={pendingTaskIds}
                  onComplete={completeTask}
                  onSchedule={scheduleTask}
                />
                <TaskList
                  title="Backlog"
                  tasks={data.todoist_upcoming_high_priority}
                  emptyLabel="No high-priority backlog surfaced."
                  pendingTaskIds={pendingTaskIds}
                  onComplete={completeTask}
                  onSchedule={scheduleTask}
                />
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section id="calendar" className="glass-panel scroll-mt-6 rounded-[30px] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="section-title text-xs font-semibold">Calendar</p>
                  <h2 className="theme-ink mt-2 text-xl font-semibold tracking-[-0.03em]">
                    Today and next
                  </h2>
                </div>
                <span className="signal-pill rounded-full px-3 py-1 text-[11px] font-semibold">
                  {data.calendar_today.length}
                </span>
              </div>
              {data.calendar_today.length === 0 ? (
                <p className="theme-empty mt-4 rounded-[20px] px-4 py-5 text-sm">
                  No events in the current pull.
                </p>
              ) : (
                <ul className="mt-4 max-h-[22rem] space-y-3 overflow-auto pr-1">
                  {data.calendar_today.map((ev) => (
                    <li key={ev.id ?? `${ev.summary}-${ev.start}`} className="list-card rounded-[22px] px-4 py-4">
                      <p className="theme-ink text-sm font-semibold leading-6">{ev.summary}</p>
                      <p className="theme-muted mt-2 text-xs leading-5">
                        {formatWhen(ev.start)}
                        {ev.end ? ` to ${formatWhen(ev.end)}` : ""}
                      </p>
                      {ev.location ? (
                        <p className="theme-accent mt-2 text-xs uppercase tracking-[0.12em]">{ev.location}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section id="important-emails" className="glass-panel scroll-mt-6 rounded-[30px] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="section-title text-xs font-semibold">Important emails</p>
                  <h2 className="theme-ink mt-2 text-xl font-semibold tracking-[-0.03em]">
                    What is surfacing
                  </h2>
                </div>
                <span className="signal-pill rounded-full px-3 py-1 text-[11px] font-semibold">
                  {data.gmail_signals.length}
                </span>
              </div>
              {data.gmail_signals.length === 0 ? (
                <p className="theme-empty mt-4 rounded-[20px] px-4 py-5 text-sm">
                  No messages matched the current signal query.
                </p>
              ) : (
                <ul className="mt-4 max-h-[22rem] space-y-3 overflow-auto pr-1">
                  {data.gmail_signals.map((g) => (
                    <li key={g.id ?? g.threadId ?? g.subject} className="list-card rounded-[22px] px-4 py-4">
                      <p className="theme-ink line-clamp-2 text-sm font-semibold leading-6">
                        {g.subject || "(no subject)"}
                      </p>
                      <p className="theme-accent mt-2 text-[11px] uppercase tracking-[0.14em]">
                        {firstName(g.from)}
                      </p>
                      {g.snippet ? (
                        <p className="theme-muted mt-2 line-clamp-2 text-sm leading-6">{g.snippet}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="glass-panel rounded-[30px] p-5">
              <p className="section-title text-xs font-semibold">Ask MyAssist</p>
              <h2 className="theme-ink mt-2 text-xl font-semibold tracking-[-0.03em]">
                Fast support when you need it
              </h2>
              <p className="theme-muted mt-2 text-sm leading-6">
                Chat, draft tasks, and challenge the plan without taking over the page.
              </p>
              <div className="mt-4">
                <AssistantConsole context={data} compact />
              </div>
            </section>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
