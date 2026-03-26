"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildHeadlineFallback } from "@/lib/assistant";
import {
  MYASSIST_CONTEXT_SOURCE_HEADER,
  type DailyContextSource,
} from "@/lib/dailyContextShared";
import type {
  MyAssistDailyContext,
  GmailSignal,
  JobHuntEmailMatch,
  SituationBrief,
  TodoistTask,
} from "@/lib/types";
import type { SavedJobRow } from "@/lib/jobHuntUiTypes";
import { AssistantConsole } from "./AssistantConsole";
import { TaskList } from "./TaskList";

type ThemeKey = "light" | "neon" | "kpop-demon-hunters" | "zara-larsson";
type DashboardTab = "overview" | "tasks" | "inbox" | "calendar" | "assistant";
type IntegrationStatus = "connected" | "revoked" | "disconnected";
type IntegrationProvider = "gmail" | "todoist" | "google_calendar" | "n8n";
type IntegrationStatusRow = { provider: IntegrationProvider; status: IntegrationStatus };
type ProviderSlice = "gmail" | "google_calendar" | "todoist";

const THEME_STORAGE_KEY = "myassist-theme";

const THEMES: Array<{ key: ThemeKey; label: string; note: string }> = [
  { key: "light", label: "Light", note: "Calm default" },
  { key: "neon", label: "Neon", note: "Dark premium" },
  { key: "kpop-demon-hunters", label: "K-pop Demon Hunters", note: "Stage energy" },
  { key: "zara-larsson", label: "Zara Larsson", note: "Soft glam dark" },
];

type ResolvedMemoryItem = {
  source: "email" | "priority" | "risk" | "next_action" | "generic";
  text: string;
  normalized: string;
  resolved_at: string;
  run_date: string;
  feedback?: "junk" | "useful_action" | "neutral";
};

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

function normalizeMemoryKey(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/["'`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  if (signals.length === 0) return "No threads in this pull.";
  if (signals.length === 1) return "1 thread in this pull.";
  return `${signals.length} threads in this pull.`;
}

function formatRunDate(data: MyAssistDailyContext): string {
  return `Run ${data.run_date} · Generated ${formatWhen(data.generated_at)}`;
}

function taskCountLabel(tasks: TodoistTask[]): string {
  return tasks.length === 1 ? "1 task" : `${tasks.length} tasks`;
}

function itemCountLabel(items: string[]): string {
  return items.length === 1 ? "1 item" : `${items.length} items`;
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

function OpinionList({
  title,
  items,
  emptyLabel,
  loadingLabel,
  isLoading,
  onResolve,
  pendingItems = [],
}: {
  title: string;
  items: string[];
  emptyLabel: string;
  loadingLabel: string;
  isLoading: boolean;
  onResolve?: (item: string) => Promise<void>;
  pendingItems?: string[];
}) {
  return (
    <section className="glass-panel min-w-[280px] self-start rounded-[28px] p-5">
      <h2 className="section-title mb-4 text-xs font-semibold">
        {title}
      </h2>
      {isLoading ? (
        <p className="theme-empty rounded-2xl px-4 py-6 text-sm leading-6">
          {loadingLabel}
        </p>
      ) : items.length === 0 ? (
        <p className="theme-empty rounded-2xl px-4 py-6 text-sm leading-6">
          {emptyLabel}
        </p>
      ) : (
        <ul className="max-h-[30rem] space-y-3 overflow-auto pr-1 text-sm">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="list-card rounded-[22px] px-4 py-4">
              <p className="theme-ink text-sm font-medium leading-6">{item}</p>
              {onResolve ? (
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    disabled={pendingItems.includes(item)}
                    onClick={() => void onResolve(item)}
                    className="theme-button-secondary rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pendingItems.includes(item) ? "Saving..." : "Handled"}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <span className={`block rounded-lg bg-white/10 animate-pulse ${className}`} aria-hidden />;
}

function DashboardMetricsSkeleton() {
  return (
    <div
      className="mt-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-4"
      role="status"
      aria-live="polite"
      aria-label="Loading dashboard metrics"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={`metric-skel-${i}`} className="metric-chip rounded-[22px] px-4 py-4">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="mt-3 h-9 w-16" />
          <SkeletonBlock className="mt-2 h-3 w-full max-w-[180px]" />
        </div>
      ))}
    </div>
  );
}

function DashboardMainSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.9fr)]">
        <div className="space-y-6">
          <section className="glass-panel-strong rounded-[30px] p-6" aria-hidden>
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="mt-4 h-8 w-full max-w-xl" />
            <SkeletonBlock className="mt-3 h-4 w-full max-w-2xl" />
            <SkeletonBlock className="mt-2 h-4 w-full max-w-xl" />
          </section>

          <section className="glass-panel rounded-[30px] p-6" aria-hidden>
            <SkeletonBlock className="h-3 w-28" />
            <SkeletonBlock className="mt-3 h-7 w-full max-w-md" />
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              <div className="list-card rounded-[22px] px-4 py-4">
                <SkeletonBlock className="h-3 w-16" />
                <SkeletonBlock className="mt-3 h-4 w-full" />
                <SkeletonBlock className="mt-2 h-4 w-5/6" />
              </div>
              <div className="list-card rounded-[22px] px-4 py-4">
                <SkeletonBlock className="h-3 w-12" />
                <SkeletonBlock className="mt-3 h-4 w-full" />
                <SkeletonBlock className="mt-2 h-4 w-4/5" />
              </div>
            </div>
          </section>

          <section className="glass-panel rounded-[30px] p-6" aria-hidden>
            <SkeletonBlock className="h-3 w-16" />
            <SkeletonBlock className="mt-3 h-7 w-48" />
            <div className="mt-6 grid items-start gap-5 lg:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, col) => (
                <div key={`task-col-${col}`} className="rounded-[22px] border border-white/5 p-4">
                  <SkeletonBlock className="h-3 w-24" />
                  {Array.from({ length: 4 }).map((__, row) => (
                    <SkeletonBlock key={`task-line-${col}-${row}`} className="mt-3 h-12 w-full" />
                  ))}
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="glass-panel rounded-[30px] p-5" aria-hidden>
            <div className="flex items-center justify-between gap-3">
              <div>
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="mt-2 h-6 w-40" />
              </div>
              <SkeletonBlock className="h-7 w-10 rounded-full" />
            </div>
            <ul className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={`cal-skel-${i}`} className="list-card rounded-[22px] px-4 py-4">
                  <SkeletonBlock className="h-4 w-3/4" />
                  <SkeletonBlock className="mt-2 h-3 w-1/2" />
                </li>
              ))}
            </ul>
          </section>

          <section className="glass-panel rounded-[30px] p-5" aria-hidden>
            <div className="flex items-center justify-between gap-3">
              <div>
                <SkeletonBlock className="h-3 w-32" />
                <SkeletonBlock className="mt-2 h-6 w-36" />
              </div>
              <SkeletonBlock className="h-7 w-10 rounded-full" />
            </div>
            <ul className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={`mail-skel-${i}`} className="list-card rounded-[22px] px-4 py-4">
                  <SkeletonBlock className="h-4 w-full" />
                  <SkeletonBlock className="mt-2 h-3 w-24" />
                  <SkeletonBlock className="mt-3 h-3 w-full" />
                </li>
              ))}
            </ul>
          </section>

          <section className="glass-panel rounded-[30px] p-5" aria-hidden>
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="mt-2 h-6 w-52" />
            <SkeletonBlock className="mt-3 h-4 w-full max-w-sm" />
            <SkeletonBlock className="mt-4 h-32 w-full rounded-[20px]" />
          </section>
        </aside>
    </div>
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
  const [loading, setLoading] = useState(() => initialData === null && initialError === null);
  const [bootstrapped, setBootstrapped] = useState(
    () => initialData !== null || initialError !== null,
  );
  const [copied, setCopied] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState<string[]>([]);
  const [pendingCrossActionKeys, setPendingCrossActionKeys] = useState<string[]>([]);
  const [taskActionError, setTaskActionError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeKey>("light");
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [headline, setHeadline] = useState<string>(
    initialData ? buildHeadlineFallback(initialData) : "Analyzing your day...",
  );
  const [situationBrief, setSituationBrief] = useState<SituationBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefFeedbackState, setBriefFeedbackState] = useState<"idle" | "sending" | "saved">("idle");
  const [resolvedItems, setResolvedItems] = useState<ResolvedMemoryItem[]>([]);
  const [pendingResolvedTexts, setPendingResolvedTexts] = useState<string[]>([]);
  const [energyLevel, setEnergyLevel] = useState<"high" | "normal" | "low">("normal");
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [savedJobsForAssign, setSavedJobsForAssign] = useState<SavedJobRow[]>([]);
  const [assignBusyKey, setAssignBusyKey] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [integrationStatuses, setIntegrationStatuses] = useState<IntegrationStatusRow[]>([]);
  const lastHeadlineKeyRef = useRef<string | null>(initialData?.generated_at ?? null);

  useEffect(() => {
    const storedTheme =
      typeof window !== "undefined" ? window.localStorage.getItem(THEME_STORAGE_KEY) : null;
    if (
      storedTheme === "light" ||
      storedTheme === "neon" ||
      storedTheme === "kpop-demon-hunters" ||
      storedTheme === "zara-larsson"
    ) {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadIntegrationStatuses = async () => {
      try {
        const res = await fetch("/api/integrations/status", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { providers?: IntegrationStatusRow[] };
        if (!cancelled && Array.isArray(body.providers)) {
          setIntegrationStatuses(body.providers);
        }
      } catch {
        if (!cancelled) setIntegrationStatuses([]);
      }
    };
    void loadIntegrationStatuses();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (theme === "light") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.dataset.theme = theme;
    }
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    const loadResolvedItems = async () => {
      try {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            kind: "memory_status",
          }),
        });
        const body = (await response.json()) as { resolved_items?: ResolvedMemoryItem[] };
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        if (!cancelled) {
          setResolvedItems(Array.isArray(body.resolved_items) ? body.resolved_items : []);
        }
      } catch {
        if (!cancelled) {
          setResolvedItems([]);
        }
      }
    };
    void loadResolvedItems();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!data) {
      setHeadline(loading ? "Analyzing your day..." : "MyAssist is getting your day ready.");
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
  }, [data, loading]);

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
            energyLevel,
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
  }, [data, energyLevel]);

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

  const loadCachedSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/daily-context?source=cache", { cache: "no-store" });
      const headerSource = res.headers.get(MYASSIST_CONTEXT_SOURCE_HEADER);
      const j = (await res.json()) as { error?: string } & Partial<MyAssistDailyContext>;

      if (res.status === 404) {
        setData(null);
        setContextSource("n8n");
        return;
      }

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
      setContextSource(
        headerSource === "mock" ? "mock" : headerSource === "cache" ? "cache" : "n8n",
      );
      setData(j as MyAssistDailyContext);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
      setBootstrapped(true);
    }
  }, []);

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

  const refreshProviderSlice = useCallback(
    async (provider: ProviderSlice) => {
      try {
        const res = await fetch(`/api/daily-context?provider=${encodeURIComponent(provider)}`, {
          cache: "no-store",
        });
        const body = (await res.json()) as
          | {
              gmail_signals?: MyAssistDailyContext["gmail_signals"];
              calendar_today?: MyAssistDailyContext["calendar_today"];
              todoist_overdue?: MyAssistDailyContext["todoist_overdue"];
              todoist_due_today?: MyAssistDailyContext["todoist_due_today"];
              todoist_upcoming_high_priority?: MyAssistDailyContext["todoist_upcoming_high_priority"];
            }
          | { error?: string };
        if (!res.ok || ("error" in body && body.error)) {
          throw new Error(("error" in body && body.error) || `HTTP ${res.status}`);
        }
        setData((previous) => {
          if (!previous) return previous;
          if (provider === "gmail" && "gmail_signals" in body && Array.isArray(body.gmail_signals)) {
            return { ...previous, gmail_signals: body.gmail_signals };
          }
          if (
            provider === "google_calendar" &&
            "calendar_today" in body &&
            Array.isArray(body.calendar_today)
          ) {
            return { ...previous, calendar_today: body.calendar_today };
          }
          if (
            provider === "todoist" &&
            "todoist_overdue" in body &&
            "todoist_due_today" in body &&
            "todoist_upcoming_high_priority" in body &&
            Array.isArray(body.todoist_overdue) &&
            Array.isArray(body.todoist_due_today) &&
            Array.isArray(body.todoist_upcoming_high_priority)
          ) {
            return {
              ...previous,
              todoist_overdue: body.todoist_overdue,
              todoist_due_today: body.todoist_due_today,
              todoist_upcoming_high_priority: body.todoist_upcoming_high_priority,
            };
          }
          return previous;
        });
      } catch (cause) {
        setTaskActionError(
          cause instanceof Error ? cause.message : `Could not refresh ${provider} data.`,
        );
      }
    },
    [],
  );

  const runCrossSystemAction = useCallback(
    async (action: "email_to_task" | "email_to_event" | "task_to_calendar_block", sourceId: string) => {
      const trimmed = sourceId.trim();
      if (!trimmed) return;
      const key = `${action}:${trimmed}`;
      setTaskActionError(null);
      setPendingCrossActionKeys((current) => [...new Set([...current, key])]);
      try {
        const response = await fetch("/api/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, sourceId: trimmed }),
        });
        const body = (await response.json()) as {
          ok?: boolean;
          error?: string;
          refreshHints?: { providers?: unknown };
        };
        if (!response.ok) {
          throw new Error(body.error ?? `HTTP ${response.status}`);
        }
        if (body.ok === false) {
          throw new Error(typeof body.error === "string" ? body.error : "Action failed.");
        }
        const rawProviders = body.refreshHints?.providers;
        const providers = (
          Array.isArray(rawProviders)
            ? rawProviders.filter(
                (p): p is ProviderSlice =>
                  p === "gmail" || p === "google_calendar" || p === "todoist",
              )
            : []
        ) as ProviderSlice[];
        const unique = [...new Set(providers)];
        await Promise.all(unique.map((provider) => refreshProviderSlice(provider)));
      } catch (cause) {
        setTaskActionError(cause instanceof Error ? cause.message : "Action failed.");
      } finally {
        setPendingCrossActionKeys((current) => current.filter((entry) => entry !== key));
      }
    },
    [refreshProviderSlice],
  );

  useEffect(() => {
    if (initialData !== null) return;
    if (initialError !== null) return;
    void loadCachedSnapshot();
  }, [initialData, initialError, loadCachedSnapshot]);

  useEffect(() => {
    let cancelled = false;
    const loadSavedJobs = async () => {
      try {
        const res = await fetch("/api/job-hunt/saved", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { ok?: boolean; jobs?: SavedJobRow[] };
        if (!cancelled && data.ok && Array.isArray(data.jobs)) {
          setSavedJobsForAssign(data.jobs);
        }
      } catch {
        if (!cancelled) setSavedJobsForAssign([]);
      }
    };
    void loadSavedJobs();
    return () => {
      cancelled = true;
    };
  }, []);

  const copyJson = useCallback(async () => {
    if (!data) return;
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data]);

  const assignEmailToJob = useCallback(async (signal: GmailSignal, jobId: string) => {
    const key = `${signal.id ?? signal.threadId ?? signal.subject}|${jobId}`;
    setAssignBusyKey(key);
    setAssignError(null);
    try {
      const response = await fetch("/api/job-hunt/email/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          signal,
          auto_extract_contact: true,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
    } catch (cause) {
      setAssignError(
        cause instanceof Error ? cause.message : "Could not assign this email to a saved job.",
      );
    } finally {
      setAssignBusyKey(null);
    }
  }, []);

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
        await refreshProviderSlice("todoist");
      } catch (cause) {
        setData(previous);
        setTaskActionError(cause instanceof Error ? cause.message : "Could not complete the task.");
      } finally {
        setPendingTaskIds((current) => current.filter((value) => value !== taskId));
      }
    },
    [data, refreshProviderSlice],
  );

  const scheduleTask = useCallback(
    async (taskId: string, dueString: string, intent?: string) => {
      if (!data) return;

      const allTasks = [
        ...data.todoist_overdue,
        ...data.todoist_due_today,
        ...data.todoist_upcoming_high_priority,
      ];
      const taskRow = allTasks.find((t) => String(t.id ?? "") === taskId);
      const taskContent =
        taskRow && typeof taskRow.content === "string" ? taskRow.content.trim() : "";

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
          body: JSON.stringify({
            dueString,
            dueLang: "en",
            ...(intent
              ? {
                  intent,
                  taskContent: taskContent || "(untitled task)",
                  run_date: data.run_date,
                }
              : {}),
          }),
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? `HTTP ${response.status}`);
        }
        await refreshProviderSlice("todoist");
      } catch (cause) {
        setData(previous);
        setTaskActionError(cause instanceof Error ? cause.message : "Could not reschedule the task.");
      } finally {
        setPendingTaskIds((current) => current.filter((value) => value !== taskId));
      }
    },
    [data, refreshProviderSlice],
  );

  const resolvedKeySet = useMemo(
    () => new Set(resolvedItems.map((item) => `${item.source}:${item.normalized}`)),
    [resolvedItems],
  );
  const visibleEmailSignals = useMemo(
    () =>
      (data?.gmail_signals ?? []).filter(
        (signal) => !resolvedKeySet.has(`email:${normalizeMemoryKey(signal.subject ?? "")}`),
      ),
    [data, resolvedKeySet],
  );
  const aiPriorityItems = useMemo(
    () =>
      (situationBrief?.top_priorities ?? []).filter(
        (item) => !resolvedKeySet.has(`priority:${normalizeMemoryKey(item)}`),
      ),
    [resolvedKeySet, situationBrief],
  );
  const displayData = useMemo(
    () => (data ? { ...data, gmail_signals: visibleEmailSignals } : null),
    [data, visibleEmailSignals],
  );
  const nextAction = useMemo(() => (displayData ? buildNextAction(displayData) : null), [displayData]);
  const showSkeleton = Boolean(loading && !data && !error);
  const needsFirstRefresh = Boolean(bootstrapped && !data && !error && !loading);

  const resolveMemoryItem = useCallback(
    async (
      text: string,
      source: ResolvedMemoryItem["source"],
      emailResolution?: "junk" | "useful_action",
      emailSignal?: Pick<GmailSignal, "id" | "threadId">,
    ) => {
      if (!data) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      setPendingResolvedTexts((current) => [...new Set([...current, trimmed])]);
      try {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            kind: "resolve_item",
            text: trimmed,
            source,
            run_date: data.run_date,
            ...(source === "email" && emailResolution
              ? { resolution_feedback: emailResolution }
              : {}),
          }),
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? `HTTP ${response.status}`);
        }
        const normalized = normalizeMemoryKey(trimmed);
        setResolvedItems((current) => [
          {
            source,
            text: trimmed,
            normalized,
            resolved_at: new Date().toISOString(),
            run_date: data.run_date,
            feedback:
              source === "email" ? (emailResolution ?? "useful_action") : undefined,
          },
          ...current.filter((item) => !(item.source === source && item.normalized === normalized)),
        ]);
        if (source === "email" && (emailSignal?.id || emailSignal?.threadId)) {
          const markReadResponse = await fetch("/api/gmail/mark-read", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...(emailSignal?.id ? { messageId: emailSignal.id } : {}),
              ...(emailSignal?.threadId ? { threadId: emailSignal.threadId } : {}),
            }),
          });
          if (!markReadResponse.ok) {
            const markBody = (await markReadResponse.json()) as { error?: string };
            setTaskActionError(
              markBody.error ??
                "Marked as handled locally, but Gmail mark-as-read did not complete.",
            );
          } else {
            await refreshProviderSlice("gmail");
          }
        }
      } catch (cause) {
        setTaskActionError(cause instanceof Error ? cause.message : "Could not save handled item.");
      } finally {
        setPendingResolvedTexts((current) => current.filter((item) => item !== trimmed));
      }
    },
    [data, refreshProviderSlice],
  );

  const handleTaskNudge = useCallback(
    async (taskId: string, direction: "up" | "down", taskText: string) => {
      if (!data) return;
      
      // Optimistic update
      setData((prev) => {
        if (!prev) return prev;
        const nextNudges = { ...(prev.user_task_nudges || {}), [taskId]: direction };
        return { ...prev, user_task_nudges: nextNudges };
      });

      try {
        const response = await fetch("/api/tasks/nudge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            run_date: data.run_date,
            taskId,
            direction,
            taskText,
          }),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        console.error("Failed to store task nudge:", error);
        // We could revert the optimistic update here, but a silent failure is fine for a minor visual nudge.
      }
    },
    [data]
  );
  const dashboardTabs: Array<{ id: DashboardTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "tasks", label: "Tasks" },
    { id: "inbox", label: "Inbox" },
    { id: "calendar", label: "Calendar" },
    { id: "assistant", label: "Assistant" },
  ];
  const showMainColumn = activeTab === "overview" || activeTab === "tasks" || activeTab === "inbox";
  const showSideColumn = activeTab === "calendar" || activeTab === "assistant";

  return (
    <div
      className="theme-shell mx-auto min-h-screen w-full max-w-[1380px] px-4 py-6 sm:px-6 xl:px-8"
      aria-busy={showSkeleton}
    >
      <section className="glass-panel-strong mb-6 rounded-[32px] px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="signal-pill rounded-full px-3 py-1 text-[11px] font-semibold">
                MyAssist
              </span>
              {data ? (
                <span className="theme-chip rounded-full px-3 py-1 text-xs font-medium">
                  {contextSource === "mock"
                    ? "Demo feed"
                    : contextSource === "cache"
                      ? "Last snapshot"
                      : "Live n8n feed"}
                </span>
              ) : showSkeleton ? (
                <span className="theme-chip rounded-full px-3 py-1 text-xs font-medium">Loading context…</span>
              ) : null}
            </div>
            <nav aria-label="Workspace" className="mt-4 flex flex-wrap gap-2">
              <span
                className="theme-button-primary inline-flex rounded-full px-4 py-2 text-xs font-semibold"
                aria-current="page"
              >
                Today
              </span>
              <Link
                href="/job-hunt"
                className="theme-button-secondary inline-flex items-center rounded-full px-4 py-2 text-xs font-semibold transition"
              >
                Job Hunt
              </Link>
            </nav>
            <h1 className="theme-ink mt-4 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              {data ? (
                <>
                  <span className="theme-muted block text-lg font-medium leading-snug sm:text-xl">
                    Welcome back.
                  </span>
                  <span className="mt-2 block">{headline}</span>
                </>
              ) : showSkeleton ? (
                <>
                  <span className="theme-muted block text-lg font-medium leading-snug sm:text-xl">
                    Welcome back.
                  </span>
                  <span className="theme-ink mt-2 block animate-pulse">{headline}</span>
                </>
              ) : needsFirstRefresh ? (
                <>
                  <span className="theme-muted block text-lg font-medium leading-snug sm:text-xl">
                    Welcome back.
                  </span>
                  <span className="mt-2 block">
                    No saved snapshot yet. Refresh runs the n8n workflow and saves it for instant next visits.
                  </span>
                </>
              ) : (
                "Welcome back. MyAssist is getting your day ready."
              )}
            </h1>
            <p className="theme-muted mt-3 max-w-3xl text-sm leading-7 sm:text-base">
              {data ? (
                formatRunDate(data)
              ) : showSkeleton ? (
                <span className="block space-y-2" role="status">
                  <SkeletonBlock className="h-4 w-full max-w-2xl" />
                  <SkeletonBlock className="h-4 w-full max-w-xl" />
                </span>
              ) : needsFirstRefresh ? (
                "After the first successful Refresh, opening Today loads that data from disk without calling n8n again."
              ) : (
                "Live daily context from n8n, with tasks, calendar, email, and assistant actions in one place."
              )}
            </p>
          </div>

          <div className="flex flex-col gap-3 xl:min-w-[440px] xl:items-end">
            <div className="flex gap-3 relative">
              <div className="theme-selector relative">
                <button
                  type="button"
                  onClick={() => {
                    const next = energyLevel === "high" ? "normal" : energyLevel === "normal" ? "low" : "high";
                    setEnergyLevel(next);
                  }}
                  className="theme-toggle rounded-full px-4 py-2 text-xs font-semibold transition"
                  title="Toggle your current energy level to adjust AI recommendations"
                >
                  {energyLevel === "high" ? "⚡ High Energy" : energyLevel === "normal" ? "🔋 Normal" : "🪫 Brain Fried"}
                </button>
              </div>
              <div className="theme-selector relative">
              <button
                type="button"
                onClick={() => setThemeMenuOpen((current) => !current)}
                className="theme-toggle rounded-full px-4 py-2 text-xs font-semibold transition"
                aria-haspopup="menu"
                aria-expanded={themeMenuOpen}
              >
                Theme: {THEMES.find((option) => option.key === theme)?.label ?? "Light"}
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
            </div>
            <div className="flex flex-wrap gap-3 xl:justify-end">
              <button
                type="button"
                onClick={() => void signOut({ callbackUrl: "/sign-in" })}
                className="theme-button-secondary rounded-full px-5 py-3 text-sm font-semibold transition"
              >
                Sign out
              </button>
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

        {showSkeleton ? (
          <DashboardMetricsSkeleton />
        ) : displayData ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
            <div className="metric-chip rounded-[22px] px-4 py-4">
              <p className="theme-accent text-[11px] uppercase tracking-[0.18em]">Urgent queue</p>
              <MetricValue
                value={countUrgentItems(displayData)}
                href="#tasks"
                label="Jump to task lists"
              />
              <p className="theme-muted mt-1 text-sm">Overdue + due today.</p>
            </div>
            <div className="metric-chip rounded-[22px] px-4 py-4">
              <p className="theme-accent text-[11px] uppercase tracking-[0.18em]">Load</p>
              <MetricValue value={pressureLevel(displayData)} label="Estimated day load" />
              <p className="theme-muted mt-1 text-sm">From task, calendar, and inbox volume.</p>
            </div>
            <div className="metric-chip rounded-[22px] px-4 py-4">
              <p className="theme-accent text-[11px] uppercase tracking-[0.18em]">Calendar</p>
              <MetricValue
                value={displayData.calendar_today.length}
                href="#calendar"
                label="Jump to calendar events"
              />
              <p className="theme-muted mt-1 text-sm">
                {displayData.calendar_today.length === 1 ? "Event today" : "Events in view"}
              </p>
            </div>
            <div className="metric-chip rounded-[22px] px-4 py-4">
              <p className="theme-accent text-[11px] uppercase tracking-[0.18em]">Inbox signals</p>
              <MetricValue
                value={displayData.gmail_signals.length}
                href="#important-emails"
                label="Jump to email list"
              />
              <p className="theme-muted mt-1 text-sm">{summarizeEmails(displayData.gmail_signals)}</p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="glass-panel mb-6 rounded-[24px] p-2">
        <nav aria-label="Today sections" className="flex flex-wrap gap-2">
          {dashboardTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.id ? "theme-button-primary" : "theme-button-secondary"
              }`}
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </section>

      <section className="glass-panel mb-6 rounded-[24px] p-4" aria-label="Integration status">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="theme-muted mr-2 font-semibold uppercase tracking-[0.14em]">Integrations</span>
          {(["gmail", "todoist", "google_calendar"] as IntegrationProvider[]).map((provider) => {
            const row = integrationStatuses.find((x) => x.provider === provider);
            const connected = row?.status === "connected";
            return (
              <div
                key={provider}
                className={`rounded-full border px-3 py-1 ${
                  connected
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-800"
                }`}
              >
                <span className="font-semibold">
                  {provider === "google_calendar" ? "Calendar" : provider === "gmail" ? "Gmail" : "Todoist"}
                </span>
                {connected ? " connected" : " disconnected"}
              </div>
            );
          })}
          <div className="ml-auto flex flex-wrap gap-2">
            {integrationStatuses.find((x) => x.provider === "gmail")?.status !== "connected" && (
              <Link
                href="/api/integrations/gmail/connect"
                className="theme-button-secondary rounded-full px-3 py-1 text-xs font-semibold"
              >
                Connect Gmail
              </Link>
            )}
            {integrationStatuses.find((x) => x.provider === "todoist")?.status !== "connected" && (
              <Link
                href="/api/integrations/todoist/connect"
                className="theme-button-secondary rounded-full px-3 py-1 text-xs font-semibold"
              >
                Connect Todoist
              </Link>
            )}
            {integrationStatuses.find((x) => x.provider === "google_calendar")?.status !== "connected" && (
              <Link
                href="/api/integrations/google_calendar/connect"
                className="theme-button-secondary rounded-full px-3 py-1 text-xs font-semibold"
              >
                Connect Calendar
              </Link>
            )}
          </div>
        </div>
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

      {contextSource === "cache" && data && !error && (
        <div
          className="glass-panel mb-6 rounded-[24px] border-emerald-500/30 bg-emerald-50/90 p-5 text-emerald-900"
          role="status"
        >
          <p className="font-semibold">Showing your last saved snapshot</p>
          <p className="mt-1 text-sm leading-6 text-emerald-900/90">
            Workflow last captured {formatWhen(data.generated_at)}. Use Refresh to run n8n again, re-rank email, and
            replace this snapshot.
          </p>
        </div>
      )}

      {needsFirstRefresh && (
        <div className="glass-panel mb-6 rounded-[24px] border-white/10 p-5" role="status">
          <p className="font-semibold theme-ink">No snapshot on disk yet</p>
          <p className="theme-muted mt-2 text-sm leading-6">
            Refresh calls n8n and stores the result under{" "}
            <code className="rounded bg-white/5 px-1.5 py-0.5">.myassist-memory</code>. Later visits load that file
            first so Today opens immediately; only Refresh triggers a new run.
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="theme-button-primary mt-4 rounded-full px-5 py-3 text-sm font-semibold transition disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh from n8n"}
          </button>
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
          <p className="font-semibold">Integration action failed.</p>
          <p className="mt-2 text-xs leading-6 opacity-90">{taskActionError}</p>
        </div>
      )}

      {assignError && !error && (
        <div role="alert" className="glass-panel mb-6 rounded-[24px] border-red-500/30 p-5 text-sm text-red-300">
          <p className="font-semibold">Email assignment failed.</p>
          <p className="mt-2 text-xs leading-6 opacity-90">{assignError}</p>
        </div>
      )}

      {showSkeleton ? (
        <DashboardMainSkeleton />
      ) : displayData ? (
        <div
          className={`grid gap-6 ${
            showMainColumn && showSideColumn ? "xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.9fr)]" : ""
          }`}
        >
          {showMainColumn ? (
            <div className="space-y-6">
              {activeTab === "overview" && nextAction ? (
              <section className="glass-panel-strong rounded-[30px] p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-3xl">
                    <p className="section-title text-xs font-semibold">First move</p>
                    <h2 className="theme-ink mt-3 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
                      {nextAction.title}
                    </h2>
                    <p className="theme-muted mt-3 text-sm leading-7 sm:text-base">{nextAction.detail}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab("tasks")}
                        className="theme-button-primary rounded-full px-4 py-2 text-xs font-semibold"
                      >
                        Open Tasks
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("inbox")}
                        className="theme-button-secondary rounded-full px-4 py-2 text-xs font-semibold"
                      >
                        Open Inbox
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("calendar")}
                        className="theme-button-secondary rounded-full px-4 py-2 text-xs font-semibold"
                      >
                        Open Calendar
                      </button>
                    </div>
                  </div>
                  <span className="signal-pill rounded-full px-3 py-1.5 text-xs font-semibold">
                    {nextAction.cue}
                  </span>
                </div>
              </section>
              ) : null}

              {activeTab === "inbox" &&
              displayData.job_hunt_email_matches &&
              displayData.job_hunt_email_matches.length > 0 ? (
              <section
                id="job-hunt-email-matches"
                className="glass-panel rounded-[30px] p-6"
                aria-label="Job hunt email matches"
              >
                <p className="section-title text-xs font-semibold">Job hunt</p>
                <h2 className="theme-ink mt-2 text-2xl font-semibold tracking-[-0.03em]">
                  Inbox linked to saved roles
                </h2>
                <p className="theme-muted mt-2 text-sm leading-7">
                  Gmail signals matched to job-hunt-manager saved leads (touchpoints logged locally).
                </p>
                <ul className="mt-4 space-y-3">
                  {displayData.job_hunt_email_matches.map((m: JobHuntEmailMatch, i: number) => (
                    <li key={`${m.job_id}-${i}`} className="list-card rounded-[22px] px-4 py-3 text-sm leading-6">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-semibold text-zinc-100">
                          {m.company}
                          <span className="theme-muted font-normal"> · {m.title}</span>
                        </p>
                        <span className="signal-pill rounded-full px-2 py-0.5 text-[11px] font-medium">
                          {Math.round(m.match_score)} · {m.match_reason.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="theme-muted mt-1 text-xs">
                        {typeof m.signal.from === "string" ? m.signal.from : String(m.signal.from ?? "")} —{" "}
                        {m.signal.subject}
                      </p>
                      {(m.touchpoint_logged || m.stage_updated) && (
                        <p className="mt-2 text-xs text-emerald-200/90">
                          {m.touchpoint_logged ? "Touchpoint logged. " : ""}
                          {m.stage_updated ? `Stage → ${m.stage_updated}` : ""}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
              ) : null}

              {activeTab === "overview" ? (
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
                    <p className="theme-accent text-[11px] uppercase tracking-[0.14em]">Day shape</p>
                    <p className="theme-ink mt-2 leading-6">{situationBrief.pressure_summary}</p>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="list-card rounded-[22px] px-4 py-4">
                      <p className="theme-accent text-[11px] uppercase tracking-[0.14em]">Focus</p>
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
                      <p className="theme-accent text-[11px] uppercase tracking-[0.14em]">Suggested moves</p>
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
                        <p className="theme-accent text-[11px] uppercase tracking-[0.14em]">Patterns</p>
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
              ) : null}

              {activeTab === "tasks" ? (
                <section id="tasks" className="glass-panel scroll-mt-6 rounded-[30px] p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="section-title text-xs font-semibold">Tasks</p>
                  <h2 className="theme-ink mt-2 text-2xl font-semibold tracking-[-0.03em]">
                    Todoist lists
                  </h2>
                  <p className="theme-muted mt-2 text-sm leading-6">
                    Overdue, today, and highlights from the situation brief — same live Todoist actions.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="theme-chip rounded-full px-3 py-1.5 text-xs font-medium">
                    Overdue {taskCountLabel(displayData.todoist_overdue)}
                  </span>
                  <span className="theme-chip rounded-full px-3 py-1.5 text-xs font-medium">
                    Today {taskCountLabel(displayData.todoist_due_today)}
                  </span>
                  <span className="theme-chip rounded-full px-3 py-1.5 text-xs font-medium">
                    Brief picks {itemCountLabel(aiPriorityItems)}
                  </span>
                </div>
              </div>
              <div className="mt-6 grid items-start gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                <TaskList
                  title="Overdue"
                  tasks={displayData.todoist_overdue}
                  emptyLabel="Nothing overdue in this snapshot."
                  pendingTaskIds={pendingTaskIds}
                  nudges={displayData.user_task_nudges}
                  onComplete={completeTask}
                  onSchedule={scheduleTask}
                  onNudge={handleTaskNudge}
                  onBlockCalendar={(taskId) => runCrossSystemAction("task_to_calendar_block", taskId)}
                  blockCalendarPendingKeys={pendingCrossActionKeys}
                />
                <TaskList
                  title="Today"
                  tasks={displayData.todoist_due_today}
                  emptyLabel="Nothing due today in this snapshot."
                  pendingTaskIds={pendingTaskIds}
                  nudges={displayData.user_task_nudges}
                  onComplete={completeTask}
                  onSchedule={scheduleTask}
                  onNudge={handleTaskNudge}
                  onBlockCalendar={(taskId) => runCrossSystemAction("task_to_calendar_block", taskId)}
                  blockCalendarPendingKeys={pendingCrossActionKeys}
                />
                <OpinionList
                  title="Brief picks"
                  items={aiPriorityItems}
                  emptyLabel="No brief picks surfaced from the current snapshot."
                  loadingLabel="MyAssist is ranking the important work..."
                  isLoading={briefLoading}
                  onResolve={async (item) => resolveMemoryItem(item, "priority")}
                  pendingItems={pendingResolvedTexts}
                />
              </div>
                </section>
              ) : null}

              {activeTab === "inbox" ? (
                <section id="important-emails" className="glass-panel scroll-mt-6 rounded-[30px] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="section-title text-xs font-semibold">Important emails</p>
                      <h2 className="theme-ink mt-2 text-xl font-semibold tracking-[-0.03em]">
                        In this pull
                      </h2>
                    </div>
                    <span className="signal-pill rounded-full px-3 py-1 text-[11px] font-semibold">
                      {displayData.gmail_signals.length}
                    </span>
                  </div>
                  {displayData.gmail_signals.length === 0 ? (
                    <p className="theme-empty mt-4 rounded-[20px] px-4 py-5 text-sm">
                      No messages matched the current signal query.
                    </p>
                  ) : (
                    <ul className="mt-4 max-h-[22rem] space-y-3 overflow-auto pr-1">
                      {displayData.gmail_signals.map((g) => {
                        const subject = g.subject || "(no subject)";
                        const itemTooltip = [subject, g.snippet].filter(Boolean).join("\n\n");
                        const hasDetailsTooltip = itemTooltip.trim().length > 0;
                        const importanceReason = typeof g.importance_reason === "string" ? g.importance_reason.trim() : "";
                        const importanceScore =
                          typeof g.importance_score === "number" ? Math.round(g.importance_score) : null;
                        const messageId =
                          g.id !== undefined && g.id !== null && String(g.id).trim() !== ""
                            ? String(g.id).trim()
                            : "";
                        const emailToTaskKey = `email_to_task:${messageId}`;
                        const emailToEventKey = `email_to_event:${messageId}`;
                        const crossEmailBusy =
                          pendingCrossActionKeys.includes(emailToTaskKey) ||
                          pendingCrossActionKeys.includes(emailToEventKey);
                        const memoryBusy = pendingResolvedTexts.includes(subject);
                        return (
                        <li key={g.id ?? g.threadId ?? g.subject} className="list-card rounded-[22px] px-4 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <p
                              className="theme-ink line-clamp-2 text-sm font-semibold leading-6"
                              title={itemTooltip}
                            >
                              {subject}
                            </p>
                            {hasDetailsTooltip ? (
                              <span
                                className="signal-pill shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                title="Hover on title to get more context"
                                aria-label="Has details tooltip"
                              >
                                i
                              </span>
                            ) : null}
                          </div>
                          <p className="theme-accent mt-2 text-[11px] uppercase tracking-[0.14em]">
                            {firstName(g.from)}
                          </p>
                          {importanceReason ? (
                            <p className="theme-muted mt-2 text-[11px] leading-5">
                              Triage intent: {importanceReason}
                              {importanceScore !== null ? ` (${importanceScore}/100)` : ""}
                            </p>
                          ) : (
                            <p className="theme-muted mt-2 text-[11px] leading-5 opacity-60">
                              Triage intent: Ranking timed out or omitted by model
                            </p>
                          )}
                          {g.snippet ? (
                            <p
                              className="theme-muted mt-2 line-clamp-2 text-sm leading-6"
                              title={g.snippet}
                            >
                              {g.snippet}
                            </p>
                          ) : null}
                          <div className="mt-3">
                            <label className="theme-muted text-[11px]">Assign to saved job</label>
                            <select
                              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-100"
                              defaultValue=""
                              disabled={assignBusyKey !== null || savedJobsForAssign.length === 0}
                              onChange={(e) => {
                                const v = e.target.value;
                                e.target.value = "";
                                if (v) void assignEmailToJob(g, v);
                              }}
                            >
                              <option value="">
                                {savedJobsForAssign.length === 0
                                  ? "No saved jobs found"
                                  : assignBusyKey
                                    ? "Assigning..."
                                    : "Select a saved job..."}
                              </option>
                              {savedJobsForAssign.map((row) => {
                                const jid = row.saved.job_id;
                                const label = row.job?.company
                                  ? `${row.job.company} · ${row.job.title} (${row.lifecycle.stage})`
                                  : `${jid} (${row.lifecycle.stage})`;
                                return (
                                  <option key={jid} value={jid}>
                                    {label}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                          <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              disabled={!messageId || crossEmailBusy || memoryBusy}
                              onClick={() => void runCrossSystemAction("email_to_task", messageId)}
                              className="theme-button-secondary rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                              title="Create a Todoist task from this message (live Gmail read)"
                            >
                              {pendingCrossActionKeys.includes(emailToTaskKey) ? "Task…" : "To Todoist"}
                            </button>
                            <button
                              type="button"
                              disabled={!messageId || crossEmailBusy || memoryBusy}
                              onClick={() => void runCrossSystemAction("email_to_event", messageId)}
                              className="theme-button-secondary rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                              title="Add a calendar block when a reliable time is available"
                            >
                              {pendingCrossActionKeys.includes(emailToEventKey) ? "Event…" : "To Calendar"}
                            </button>
                            <button
                              type="button"
                              disabled={pendingResolvedTexts.includes(subject)}
                              onClick={() =>
                                void resolveMemoryItem(subject, "email", "useful_action", {
                                  id: g.id,
                                  threadId: g.threadId,
                                })
                              }
                              className="theme-button-secondary rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                              title="Real work — teach the AI this kind of mail matters"
                            >
                              {pendingResolvedTexts.includes(subject) ? "Saving..." : "Handled"}
                            </button>
                            <button
                              type="button"
                              disabled={pendingResolvedTexts.includes(subject)}
                              onClick={() =>
                                void resolveMemoryItem(subject, "email", "junk", {
                                  id: g.id,
                                  threadId: g.threadId,
                                })
                              }
                              className="theme-button-secondary rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                              title="Not important — teach the AI to deprioritize similar mail"
                            >
                              {pendingResolvedTexts.includes(subject) ? "Saving..." : "Junk"}
                            </button>
                          </div>
                        </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              ) : null}
            </div>
          ) : null}

          {showSideColumn ? (
            <aside className="space-y-6">
              {activeTab === "calendar" ? (
                <section id="calendar" className="glass-panel scroll-mt-6 rounded-[30px] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="section-title text-xs font-semibold">Calendar</p>
                  <h2 className="theme-ink mt-2 text-xl font-semibold tracking-[-0.03em]">
                    Today and next
                  </h2>
                </div>
                <span className="signal-pill rounded-full px-3 py-1 text-[11px] font-semibold">
                  {displayData.calendar_today.length}
                </span>
              </div>
              {displayData.calendar_today.length === 0 ? (
                <p className="theme-empty mt-4 rounded-[20px] px-4 py-5 text-sm">
                  No events in the current pull.
                </p>
              ) : (
                <ul className="mt-4 max-h-[22rem] space-y-3 overflow-auto pr-1">
                  {displayData.calendar_today.map((ev) => (
                    <li key={ev.id ?? `${ev.summary}-${ev.start}`} className="list-card rounded-[22px] px-4 py-4">
                      <p
                        className="theme-ink text-sm font-semibold leading-6"
                        title={ev.location ? `${ev.summary}\n${ev.location}` : ev.summary}
                      >
                        {ev.summary}
                      </p>
                      <p className="theme-muted mt-2 text-xs leading-5">
                        {formatWhen(ev.start)}
                        {ev.end ? ` to ${formatWhen(ev.end)}` : ""}
                      </p>
                      {ev.location ? (
                        <p
                          className="theme-accent mt-2 text-xs uppercase tracking-[0.12em]"
                          title={ev.location}
                        >
                          {ev.location}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
                </section>
              ) : null}

              {activeTab === "assistant" ? (
                <section className="glass-panel rounded-[30px] p-5">
              <p className="section-title text-xs font-semibold">Ask MyAssist</p>
              <h2 className="theme-ink mt-2 text-xl font-semibold tracking-[-0.03em]">
                Fast support when you need it
              </h2>
              <p className="theme-muted mt-2 text-sm leading-6">
                Chat, draft tasks, and challenge the plan without taking over the page.
              </p>
              <div className="mt-4">
                <AssistantConsole context={displayData} compact />
              </div>
                </section>
              ) : null}
            </aside>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
