import type { MyAssistDailyContext } from "@/lib/types";
import { buildJobHuntExpansion, type JobHuntExpansionInsights } from "./jobHuntExpansionService";
import { buildTodayInsights, type TodayInsights } from "./todayIntelligenceService";

export type DailySynthesis = {
  /** Single operational line (hero / assistant welcome). */
  oneLineSummary: string;
  /** Up to 4 highest-value focus lines. */
  topPriorities: string[];
  /** What to handle immediately (tasks, interviews, hot follow-ups). */
  actionNow: string[];
  /** Safe to defer after the above. */
  canWait: string[];
};

const TORONTO = "America/Toronto";

function formatTimeToday(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

function headlineLoad(context: MyAssistDailyContext): "heavy" | "mixed" | "light" {
  const urgent = context.todoist_overdue.length + context.todoist_due_today.length;
  if (urgent >= 8 || context.calendar_today.length > 5) return "heavy";
  if (urgent >= 3 || context.gmail_signals.length > 6) return "mixed";
  return "light";
}

/**
 * Deterministic daily synthesis from live context + intelligence outputs (no LLM).
 */
export function buildDailySynthesis(
  context: MyAssistDailyContext,
  insights: TodayInsights,
  jobHunt: JobHuntExpansionInsights,
): DailySynthesis {
  const load = headlineLoad(context);

  const interviewPriority = insights.priorities.find((p) => p.id.startsWith("priority-interview-"));
  const overduePriority = insights.priorities.find((p) => p.id === "priority-overdue-tasks");
  const prepRisk = insights.risks.find((r) => r.id.startsWith("risk-interview-no-prep-"));
  const fuNow = jobHunt.followUpTiming.filter((r) => r.status === "follow_up_now");

  let oneLineSummary: string;
  if (interviewPriority && load === "heavy") {
    oneLineSummary = "Interview on the calendar with heavy task load — sequence prep before new commitments.";
  } else if (interviewPriority) {
    oneLineSummary = "Interview day: protect prep time and keep tasks from spilling.";
  } else if (prepRisk) {
    oneLineSummary = "Upcoming interview signal without prep coverage in Todoist — close that gap first.";
  } else if (overduePriority && context.todoist_overdue.length >= 5) {
    oneLineSummary = "Multiple overdue tasks are still open; triage before taking on new work.";
  } else if (overduePriority) {
    oneLineSummary = "Open overdue items need attention before the day expands.";
  } else if (fuNow.length > 0) {
    oneLineSummary = "Recruiter follow-up timing is hot — prioritize replies before shallow work.";
  } else if (load === "heavy") {
    oneLineSummary = "Heavy day across tasks, calendar, and inbox — stay sequential, not reactive.";
  } else if (load === "mixed") {
    oneLineSummary = "Mixed pressure: clear the next obligation, then protect a focus block.";
  } else {
    oneLineSummary = "Runway is relatively clear — use it for high-leverage work.";
  }

  const topPriorities: string[] = [];
  for (const p of insights.priorities.slice(0, 4)) {
    topPriorities.push(p.explanation ? `${p.title} — ${p.explanation}` : p.title);
  }
  if (topPriorities.length < 4 && jobHunt.prepRecommendations[0]) {
    const pr = jobHunt.prepRecommendations[0];
    topPriorities.push(
      `Job hunt prep: ${pr.contextLabel}${pr.company ? ` (${pr.company})` : ""}`,
    );
  }

  const actionNow: string[] = [];
  if (context.todoist_overdue.length > 0) {
    actionNow.push(
      `${context.todoist_overdue.length} overdue task${context.todoist_overdue.length === 1 ? "" : "s"} to clear or reschedule`,
    );
  }
  if (interviewPriority) {
    const ev = context.calendar_today.find((e) => /interview|screen|onsite/i.test(e.summary || ""));
    const t = ev?.start ? formatTimeToday(ev.start) : null;
    actionNow.push(t ? `Interview today at ${t}` : "Interview-related block today — confirm prep");
  }
  if (prepRisk) {
    actionNow.push("Add prep tasks before the interview window");
  }
  for (const row of fuNow.slice(0, 2)) {
    actionNow.push(`Follow-up: ${row.subject.slice(0, 72)}${row.subject.length > 72 ? "…" : ""}`);
  }
  if (insights.risks.some((r) => r.id.startsWith("risk-cal-conflict-"))) {
    actionNow.push("Resolve overlapping calendar blocks");
  }

  const canWait: string[] = [];
  for (const s of insights.suggestions) {
    canWait.push(s.explanation ? `${s.title} — ${s.explanation}` : s.title);
  }
  for (const row of jobHunt.followUpTiming.filter((r) => r.status === "wait" || r.status === "monitor")) {
    canWait.push(`${row.subject.slice(0, 60)}${row.subject.length > 60 ? "…" : ""} (${row.status.replace(/_/g, " ")})`);
  }
  if (context.todoist_upcoming_high_priority.length >= 3 && context.todoist_overdue.length === 0) {
    canWait.push(
      `${context.todoist_upcoming_high_priority.length} upcoming high-priority tasks can be scheduled after today's fires`,
    );
  }

  return {
    oneLineSummary,
    topPriorities: topPriorities.slice(0, 4),
    actionNow: actionNow.slice(0, 6),
    canWait: canWait.slice(0, 5),
  };
}

/** Convenience: build insights + job hunt from context, then synthesize. */
export function buildDailySynthesisFromContext(context: MyAssistDailyContext): DailySynthesis {
  return buildDailySynthesis(context, buildTodayInsights(context), buildJobHuntExpansion(context));
}
