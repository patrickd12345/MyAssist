import type { CalendarEvent, GmailSignal, MyAssistDailyContext, TodoistTask } from "@/lib/types";
import type { SuggestedAction } from "./insightActionService";

export type { SuggestedAction } from "./insightActionService";

/** Input shape for intelligence analysis (alias for primary daily context type). */
export type DailyContext = MyAssistDailyContext;

export type Insight = {
  id: string;
  title: string;
  description?: string;
  /** Short reason tied to live context (counts, times, aging). */
  explanation?: string;
  /** Legacy single control; prefer `actions` when multiple automations apply. */
  action?: SuggestedAction;
  actions?: SuggestedAction[];
  severity?: "low" | "medium" | "high";
};

export type TodayInsights = {
  priorities: Insight[];
  risks: Insight[];
  suggestions: Insight[];
  followUps: Insight[];
};

const TORONTO = "America/Toronto";

const INTERVIEW_KW = /\b(interview|onsite|on-?site|loop|screen|technical\s*interview|tech\s*interview)\b/i;

const PREP_KW = /\b(prep|prepare|study|leetcode|review|mock\s*interview)\b/i;

const REPLY_KW = /\b(reply|confirm|schedule|let\s+us\s+know|rsvp|respond)\b/i;

function formatLocalDateInToronto(iso: string): string | null {
  const trimmed = iso.trim();
  const dateOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(trimmed);
  if (dateOnly) return dateOnly[1]!;

  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !day) return null;
  return `${y}-${m}-${day}`;
}

function isTimedEventStart(start: string | null): boolean {
  if (!start) return false;
  return start.includes("T");
}

/** Parse start/end as epoch ms; returns null if unusable for overlap. */
function eventTimedBounds(ev: CalendarEvent): { startMs: number; endMs: number } | null {
  if (!ev.start || !isTimedEventStart(ev.start)) return null;
  const startMs = new Date(ev.start).getTime();
  if (Number.isNaN(startMs)) return null;
  let endMs: number;
  if (ev.end && isTimedEventStart(ev.end)) {
    endMs = new Date(ev.end).getTime();
    if (Number.isNaN(endMs)) endMs = startMs + 60 * 60 * 1000;
  } else {
    endMs = startMs + 60 * 60 * 1000;
  }
  if (endMs <= startMs) endMs = startMs + 15 * 60 * 1000;
  return { startMs, endMs };
}

function overlaps(a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

function isInterviewLikeEvent(ev: CalendarEvent): boolean {
  return INTERVIEW_KW.test(ev.summary || "");
}

function taskContent(t: TodoistTask): string {
  return typeof t.content === "string" ? t.content : "";
}

function allTasksForPrepScan(context: MyAssistDailyContext): TodoistTask[] {
  return [
    ...context.todoist_overdue,
    ...context.todoist_due_today,
    ...context.todoist_upcoming_high_priority,
  ];
}

function hasPrepLikeTask(context: MyAssistDailyContext): boolean {
  return allTasksForPrepScan(context).some((t) => PREP_KW.test(taskContent(t)));
}

function followUpFromSignal(signal: GmailSignal): boolean {
  const j = signal.job_hunt_analysis;
  if (!j?.signals?.length) return false;
  if (j.signals.includes("follow_up")) return true;
  if (
    (j.signals.includes("interview_request") || j.signals.includes("technical_interview")) &&
    REPLY_KW.test(`${signal.subject} ${signal.snippet}`)
  ) {
    return true;
  }
  return false;
}

function signalDedupeKey(s: GmailSignal): string {
  return s.threadId || s.id || `${s.from}:${s.subject}`;
}

function formatTimeToronto(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

function daysSinceEmailDate(iso: string | undefined, nowMs: number): number | null {
  if (!iso?.trim()) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 86_400_000));
}

/** Lower sorts earlier (higher value). */
function rankPriorityInsight(id: string): number {
  if (id.startsWith("priority-interview-")) return 0;
  if (id === "priority-overdue-tasks") return 1;
  return 5;
}

function rankRiskInsight(id: string): number {
  if (id.startsWith("risk-interview-no-prep-")) return 0;
  if (id.startsWith("risk-cal-conflict-")) return 1;
  return 5;
}

function followUpInsightId(signal: GmailSignal): string {
  const key = signalDedupeKey(signal);
  return `followup-${key.replace(/\s+/g, "-").slice(0, 80)}`;
}

function rankSuggestionInsight(id: string): number {
  if (id === "suggestion-high-priority-backlog") return 1;
  if (id === "suggestion-inbox-depth") return 2;
  return 5;
}

export function buildTodayInsights(context: MyAssistDailyContext): TodayInsights {
  const priorities: Insight[] = [];
  const risks: Insight[] = [];
  const suggestions: Insight[] = [];
  const followUps: Insight[] = [];

  const runDate = context.run_date;
  const now = Date.now();

  for (const ev of context.calendar_today) {
    if (!isInterviewLikeEvent(ev) || !ev.start) continue;
    const localStartDay = formatLocalDateInToronto(ev.start);
    if (localStartDay !== runDate) continue;

    const timeLabel = ev.start ? formatTimeToronto(ev.start) : null;
    priorities.push({
      id: `priority-interview-${ev.id ?? ev.summary}`,
      title: `Interview today: ${ev.summary}`,
      description: ev.location ? `Location: ${ev.location}` : undefined,
      explanation: timeLabel
        ? `Interview today at ${timeLabel}${ev.location ? ` · ${ev.location}` : ""}`
        : "Interview-typed event is on today’s calendar",
      severity: "high",
      action: { kind: "tab", tab: "calendar" },
    });

    const timed = eventTimedBounds(ev);
    if (timed && timed.startMs > now && !hasPrepLikeTask(context)) {
      const startHuman = ev.start ? formatTimeToronto(ev.start) : null;
      risks.push({
        id: `risk-interview-no-prep-${ev.id ?? ev.summary}`,
        title: "Upcoming interview without prep tasks",
        description: `“${ev.summary}” starts later today; no obvious prep/review tasks found in Todoist slices.`,
        explanation: startHuman
          ? `Interview at ${startHuman} and no prep/review tasks found in Todoist`
          : "Interview window today without prep coverage in Todoist",
        severity: "high",
        action: { kind: "tab", tab: "tasks" },
      });
    }
  }

  const overdueCount = context.todoist_overdue.length;
  if (overdueCount > 0) {
    const samples = context.todoist_overdue
      .slice(0, 3)
      .map(taskContent)
      .filter(Boolean)
      .join("; ");
    priorities.push({
      id: "priority-overdue-tasks",
      title: overdueCount === 1 ? "1 overdue task" : `${overdueCount} overdue tasks`,
      description: samples ? `Includes: ${samples}${overdueCount > 3 ? "…" : ""}` : undefined,
      explanation:
        overdueCount === 1
          ? "1 overdue task is still open"
          : `${overdueCount} overdue tasks are still open`,
      severity: overdueCount >= 5 ? "high" : "medium",
      action: { kind: "tab", tab: "tasks" },
    });
  }

  const seenFollowUp = new Set<string>();
  for (const signal of context.gmail_signals) {
    if (!followUpFromSignal(signal)) continue;
    const key = signalDedupeKey(signal);
    if (seenFollowUp.has(key)) continue;
    seenFollowUp.add(key);

    const messageId = signal.id?.trim();
    const days = daysSinceEmailDate(signal.date, now);
    const aging =
      days === null
        ? "Follow-up signal in today’s Gmail slice"
        : days === 0
          ? "Recruiter follow-up signal from today — confirm next steps"
          : days === 1
            ? "Last recruiter touch was about 1 day ago"
            : `Last recruiter follow-up signal is aging (~${days} days since email date)`;
    followUps.push({
      id: followUpInsightId(signal),
      title: `Follow up: ${signal.subject || "Email"}`,
      description: signal.from ? `From ${signal.from}` : undefined,
      explanation: aging,
      severity: "medium",
      ...(messageId
        ? {
            actions: [
              { type: "create_prep_tasks" as const, payload: { messageId } },
              { type: "create_followup_task" as const, payload: { messageId } },
              { type: "block_focus_time" as const, payload: { messageId } },
            ],
          }
        : { action: { kind: "focus_inbox" as const } }),
    });
  }

  const timedEvents = context.calendar_today
    .map((ev, idx) => ({ ev, idx, bounds: eventTimedBounds(ev) }))
    .filter((x): x is { ev: CalendarEvent; idx: number; bounds: { startMs: number; endMs: number } } => x.bounds !== null);

  for (let i = 0; i < timedEvents.length; i++) {
    for (let j = i + 1; j < timedEvents.length; j++) {
      const A = timedEvents[i]!;
      const B = timedEvents[j]!;
      if (overlaps(A.bounds, B.bounds)) {
        const idA = A.ev.id ?? `i${A.idx}`;
        const idB = B.ev.id ?? `i${B.idx}`;
        risks.push({
          id: `risk-cal-conflict-${idA}-${idB}`,
          title: "Calendar overlap",
          description: `“${A.ev.summary}” and “${B.ev.summary}” overlap.`,
          explanation: "Two timed events overlap on today’s calendar",
          severity: "high",
          action: { kind: "tab", tab: "calendar" },
        });
      }
    }
  }

  const upcomingHp = context.todoist_upcoming_high_priority.length;
  if (upcomingHp >= 3 && overdueCount === 0) {
    suggestions.push({
      id: "suggestion-high-priority-backlog",
      title: "Heavy upcoming load",
      description: `${upcomingHp} high-priority tasks ahead. Consider time-blocking before new commitments.`,
      explanation: `${upcomingHp} high-priority tasks queued ahead — can wait until urgent work clears`,
      severity: "low",
      action: { kind: "tab", tab: "tasks" },
    });
  }

  if (context.gmail_signals.length >= 8 && followUps.length === 0) {
    suggestions.push({
      id: "suggestion-inbox-depth",
      title: "Busy inbox signals",
      description: `${context.gmail_signals.length} items in today’s Gmail slice. Batch triage may help.`,
      explanation: `${context.gmail_signals.length} signals in today’s slice — batch triage when fires are out`,
      severity: "low",
      action: { kind: "tab", tab: "inbox" },
    });
  }

  priorities.sort((a, b) => rankPriorityInsight(a.id) - rankPriorityInsight(b.id));
  risks.sort((a, b) => rankRiskInsight(a.id) - rankRiskInsight(b.id));
  followUps.sort((a, b) => {
    const sa = context.gmail_signals.find((s) => followUpInsightId(s) === a.id);
    const sb = context.gmail_signals.find((s) => followUpInsightId(s) === b.id);
    const da = sa ? daysSinceEmailDate(sa.date, now) : null;
    const db = sb ? daysSinceEmailDate(sb.date, now) : null;
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return db - da;
  });
  suggestions.sort((a, b) => rankSuggestionInsight(a.id) - rankSuggestionInsight(b.id));

  return { priorities, risks, suggestions, followUps };
}
