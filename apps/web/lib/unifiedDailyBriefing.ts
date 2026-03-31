import "server-only";

import { executeChat } from "./aiRuntime";
import { resolveMyAssistRuntimeEnv } from "./env/runtime";
import { isInterviewLikeCalendarEvent } from "./services/todayIntelligenceService";
import type { GmailPhaseBSignalType } from "./integrations/gmailSignalDetection";
import type { GmailSignal, MyAssistDailyContext, UnifiedDailyBriefing } from "./types";

function signalTypes(signal: GmailSignal): Set<GmailPhaseBSignalType> {
  const out = new Set<GmailPhaseBSignalType>();
  for (const row of signal.phase_b_signals ?? []) out.add(row.type);
  return out;
}

function subjectLine(signal: GmailSignal): string {
  const line = signal.subject.trim() || signal.snippet.trim() || "(no subject)";
  return line.length > 96 ? `${line.slice(0, 93)}...` : line;
}

function firstTaskTitle(task: Record<string, unknown> | undefined): string {
  if (!task) return "";
  const content = typeof task.content === "string" ? task.content : "";
  return content.trim();
}

function mergeUnique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function deterministicSummary(briefing: UnifiedDailyBriefing): string {
  const parts = [
    `Urgent ${briefing.counts.urgent}, important ${briefing.counts.important}, action required ${briefing.counts.action_required}.`,
    briefing.schedule_summary,
    briefing.tasks_summary,
    briefing.email_summary,
  ].filter(Boolean);
  return parts.join(" ");
}

function aiEnabled(): boolean {
  const v = resolveMyAssistRuntimeEnv().myassistDailyIntelAi.trim().toLowerCase();
  return v === "1" || v === "true";
}

async function enrichUnifiedBriefingWithAi(briefing: UnifiedDailyBriefing): Promise<UnifiedDailyBriefing> {
  if (!aiEnabled()) return briefing;
  try {
    const res = await executeChat({
      temperature: 0.2,
      maxTokens: 140,
      messages: [
        {
          role: "system",
          content:
            "Write one short daily briefing sentence. Keep it concrete and action-first. Do not use markdown.",
        },
        {
          role: "user",
          content: JSON.stringify({
            urgent: briefing.urgent.slice(0, 4),
            important: briefing.important.slice(0, 4),
            action_required: briefing.action_required.slice(0, 4),
            schedule_summary: briefing.schedule_summary,
            tasks_summary: briefing.tasks_summary,
            email_summary: briefing.email_summary,
            summary: briefing.summary,
          }),
        },
      ],
    });
    const line = res.text.trim();
    if (!line) return briefing;
    return { ...briefing, aiSummary: line };
  } catch {
    return briefing;
  }
}

export async function buildUnifiedDailyBriefing(
  context: MyAssistDailyContext,
): Promise<UnifiedDailyBriefing> {
  const urgent: string[] = [];
  const important: string[] = [];
  const actionRequired: string[] = [];
  const jobRelated: string[] = [];

  const overdueHighPriority = context.todoist_overdue.filter(
    (task) => typeof task.priority === "number" && task.priority >= 3,
  );
  const dueToday = context.todoist_due_today;

  for (const signal of context.gmail_signals) {
    const types = signalTypes(signal);
    const subject = subjectLine(signal);

    if (types.has("action_required")) actionRequired.push(`Email: ${subject}`);

    if (types.has("job_offer") && types.has("action_required")) {
      urgent.push(`Job offer needs response: ${subject}`);
    }

    if (types.has("job_interview") && types.has("action_required")) {
      urgent.push(`Interview action needed: ${subject}`);
    }

    if (types.has("important")) important.push(`Important email: ${subject}`);
    if (types.has("job_recruiter")) important.push(`Recruiter email: ${subject}`);

    if (
      types.has("job_offer") ||
      types.has("job_interview") ||
      types.has("job_recruiter") ||
      types.has("job_application") ||
      types.has("job_related")
    ) {
      jobRelated.push(`Email: ${subject}`);
    }
  }

  const interviewToday = context.calendar_today.some(
    (event) => isInterviewLikeCalendarEvent(event) && event.start?.slice(0, 10) === context.run_date,
  );
  if (interviewToday) {
    const label =
      context.calendar_today.find(
        (event) => isInterviewLikeCalendarEvent(event) && event.start?.slice(0, 10) === context.run_date,
      )?.summary ?? "Interview event";
    urgent.push(`Interview today: ${label}`);
    important.push(`Meeting today: ${label}`);
    jobRelated.push(`Calendar: ${label}`);
  }

  if (context.calendar_intelligence?.signals.some((s) => s.type === "scheduling_conflict")) {
    urgent.push("Scheduling conflict detected in calendar");
  }

  if (overdueHighPriority.length > 0) {
    const top = firstTaskTitle(overdueHighPriority[0]);
    urgent.push(top ? `Overdue high-priority task: ${top}` : "Overdue high-priority task");
  }

  if (dueToday.length > 0) {
    const top = firstTaskTitle(dueToday[0]);
    important.push(top ? `Due today task: ${top}` : "Tasks due today");
  }

  const taskActions = [...context.todoist_overdue, ...context.todoist_due_today]
    .map((task) => firstTaskTitle(task))
    .filter(Boolean)
    .slice(0, 3)
    .map((title) => `Task: ${title}`);
  actionRequired.push(...taskActions);

  const scheduleSummary =
    context.calendar_intelligence?.summary ??
    (context.calendar_today.length === 0
      ? "No calendar events in the current window."
      : `${context.calendar_today.length} calendar event(s) in view.`);
  const tasksSummary =
    context.todoist_intelligence?.summary ??
    `Todoist: ${context.todoist_overdue.length} overdue, ${context.todoist_due_today.length} due today.`;
  const emailSummary =
    context.daily_intelligence?.summary.generatedDeterministicSummary ??
    (context.gmail_signals.length === 0
      ? "No Gmail messages in today's context."
      : `${context.gmail_signals.length} Gmail signal(s) in context.`);

  const base: UnifiedDailyBriefing = {
    urgent: mergeUnique(urgent).slice(0, 6),
    important: mergeUnique(important).slice(0, 8),
    action_required: mergeUnique(actionRequired).slice(0, 8),
    job_related: mergeUnique(jobRelated).slice(0, 8),
    calendar_events_in_view: context.calendar_today.length,
    schedule_summary: scheduleSummary,
    tasks_summary: tasksSummary,
    email_summary: emailSummary,
    summary: "",
    counts: {
      urgent: mergeUnique(urgent).length,
      important: mergeUnique(important).length,
      action_required: mergeUnique(actionRequired).length,
      job_related: mergeUnique(jobRelated).length,
    },
  };

  const withSummary: UnifiedDailyBriefing = {
    ...base,
    summary: deterministicSummary(base),
  };

  return enrichUnifiedBriefingWithAi(withSummary);
}
