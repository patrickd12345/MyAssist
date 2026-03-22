"use client";

import { useCallback, useState } from "react";
import type { MyAssistDailyContext } from "@/lib/types";
import { TaskList } from "./TaskList";

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Dashboard({
  initialData,
  initialError,
}: {
  initialData: MyAssistDailyContext | null;
  initialError: string | null;
}) {
  const [data, setData] = useState<MyAssistDailyContext | null>(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/daily-context", { cache: "no-store" });
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

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 py-10">
      <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            MyAssist daily context
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Read-only facts from n8n. Planning stays in the Custom GPT (MyAssist Operator).
          </p>
          {data && (
            <p className="mt-2 text-xs text-zinc-500">
              Run date <span className="font-mono">{data.run_date}</span>
              {" · "}
              Generated{" "}
              <span className="font-mono">{formatWhen(data.generated_at)}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => void copyJson()}
            disabled={!data || loading}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {copied ? "Copied" : "Copy JSON for Custom GPT"}
          </button>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <p className="font-medium">Could not load context</p>
          <p className="mt-1 font-mono text-xs opacity-90">{error}</p>
          <p className="mt-3 text-xs">
            Set <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/60">MYASSIST_N8N_WEBHOOK_URL</code>{" "}
            in <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/60">apps/web/.env.local</code> to
            your n8n production webhook URL, activate the workflow, then refresh.
          </p>
        </div>
      )}

      {data && (
        <div className="space-y-10">
          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Calendar today
            </h2>
            {data.calendar_today.length === 0 ? (
              <p className="text-sm text-zinc-500">No events in the window.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {data.calendar_today.map((ev) => (
                  <li
                    key={ev.id ?? `${ev.summary}-${ev.start}`}
                    className="rounded-md border border-zinc-100 px-3 py-2 dark:border-zinc-800"
                  >
                    <div className="font-medium">{ev.summary}</div>
                    <div className="text-zinc-600 dark:text-zinc-400">
                      {formatWhen(ev.start)} {ev.end ? `– ${formatWhen(ev.end)}` : ""}
                    </div>
                    {ev.location ? (
                      <div className="text-xs text-zinc-500">{ev.location}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="grid gap-6 md:grid-cols-3">
            <TaskList
              title="Overdue"
              tasks={data.todoist_overdue}
              emptyLabel="None in this snapshot."
            />
            <TaskList
              title="Due today"
              tasks={data.todoist_due_today}
              emptyLabel="None in this snapshot."
            />
            <TaskList
              title="High priority (no date)"
              tasks={data.todoist_upcoming_high_priority}
              emptyLabel="None in this snapshot."
            />
          </div>

          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Gmail signals
            </h2>
            {data.gmail_signals.length === 0 ? (
              <p className="text-sm text-zinc-500">No messages matched the query.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {data.gmail_signals.map((g) => (
                  <li
                    key={g.id ?? g.threadId ?? g.subject}
                    className="rounded-md border border-zinc-100 px-3 py-2 dark:border-zinc-800"
                  >
                    <div className="font-medium">{g.subject || "(no subject)"}</div>
                    <div className="text-zinc-600 dark:text-zinc-400">{g.from}</div>
                    {g.snippet ? (
                      <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{g.snippet}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
