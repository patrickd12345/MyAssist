import type { CalendarEvent, MyAssistDailyContext, TodoistTask } from "@/lib/types";
import type { DailySynthesis } from "./dailySynthesisService";
import { buildJobHuntExpansion, type JobHuntExpansionInsights } from "./jobHuntExpansionService";
import { buildTodayInsights, isInterviewLikeCalendarEvent, type TodayInsights } from "./todayIntelligenceService";

const TORONTO = "America/Toronto";

export type ProactiveChangeKind =
  | "new_interview"
  | "new_follow_up"
  | "new_overdue"
  | "new_calendar_conflict";

export type ProactiveChange = {
  kind: ProactiveChangeKind;
  title: string;
  detail?: string;
};

export type MorningBriefing = {
  greetingLine: string;
  leadLine: string;
  bullets: string[];
};

export type ProactiveIntelligenceResult = {
  morningBriefing: MorningBriefing;
  changesSinceLastVisit: ProactiveChange[];
  recommendedActions: string[];
};

export type BuildProactiveIntelligenceInput = {
  previousSnapshot: MyAssistDailyContext | null;
  lastVisitAt: string | null;
  currentContext: MyAssistDailyContext;
  nowMs: number;
  dailySynthesis: DailySynthesis;
  todayInsights: TodayInsights;
  jobHunt: JobHuntExpansionInsights;
};

function calendarDateInToronto(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function parseIsoToTorontoDate(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return calendarDateInToronto(t);
}

function hourInToronto(ms: number): number {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: TORONTO,
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date(ms));
  const h = parts.find((p) => p.type === "hour")?.value;
  const n = h ? parseInt(h, 10) : NaN;
  return Number.isNaN(n) ? 12 : n;
}

function buildGreetingLine(lastVisitAt: string | null, nowMs: number): string {
  const lastDay = parseIsoToTorontoDate(lastVisitAt);
  const today = calendarDateInToronto(nowMs);
  if (lastDay && lastDay === today) {
    return "Welcome back";
  }
  const hour = hourInToronto(nowMs);
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function interviewEventKey(ev: CalendarEvent): string {
  const id = typeof ev.id === "string" ? ev.id.trim() : "";
  if (id) return `id:${id}`;
  const start = (ev.start ?? "").trim();
  const sum = (ev.summary ?? "").trim().toLowerCase();
  return `fb:${start}|${sum}`;
}

function interviewLikeKeys(context: MyAssistDailyContext): Set<string> {
  const out = new Set<string>();
  for (const ev of context.calendar_today) {
    if (!isInterviewLikeCalendarEvent(ev)) continue;
    out.add(interviewEventKey(ev));
  }
  return out;
}

function overdueTaskIds(tasks: TodoistTask[]): Set<string> {
  const s = new Set<string>();
  for (const t of tasks) {
    const id = typeof t.id === "string" ? t.id.trim() : "";
    if (id) s.add(id);
  }
  return s;
}

function conflictRiskIds(insights: TodayInsights): Set<string> {
  const s = new Set<string>();
  for (const r of insights.risks) {
    if (r.id.startsWith("risk-cal-conflict-")) s.add(r.id);
  }
  return s;
}

function buildMorningBriefing(
  synthesis: DailySynthesis,
  lastVisitAt: string | null,
  nowMs: number,
): MorningBriefing {
  return {
    greetingLine: buildGreetingLine(lastVisitAt, nowMs),
    leadLine: synthesis.oneLineSummary,
    bullets: synthesis.topPriorities.slice(0, 4),
  };
}

function buildRecommendedActions(changes: ProactiveChange[], actionNow: string[]): string[] {
  const fromChanges = changes.map((c) => c.title.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of [...fromChanges, ...actionNow.map((x) => x.trim()).filter(Boolean)]) {
    const k = line.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(line);
    if (out.length >= 7) break;
  }
  return out;
}

/**
 * Deterministic proactive layer: morning briefing, diff since last dashboard visit, recommended actions.
 */
export function buildProactiveIntelligence(input: BuildProactiveIntelligenceInput): ProactiveIntelligenceResult {
  const {
    previousSnapshot,
    lastVisitAt,
    currentContext,
    nowMs,
    dailySynthesis,
    todayInsights,
    jobHunt,
  } = input;

  const morningBriefing = buildMorningBriefing(dailySynthesis, lastVisitAt, nowMs);
  const changesSinceLastVisit: ProactiveChange[] = [];

  if (previousSnapshot) {
    const prevKeys = interviewLikeKeys(previousSnapshot);
    for (const ev of currentContext.calendar_today) {
      if (!isInterviewLikeCalendarEvent(ev)) continue;
      const key = interviewEventKey(ev);
      if (prevKeys.has(key)) continue;
      changesSinceLastVisit.push({
        kind: "new_interview",
        title: `New interview-style event: ${ev.summary || "(untitled)"}`,
        detail: ev.start ? `Starts ${ev.start}` : undefined,
      });
    }

    const prevOverdue = overdueTaskIds(previousSnapshot.todoist_overdue);
    const currOverdue = overdueTaskIds(currentContext.todoist_overdue);

    // Create a map to avoid O(n) lookups inside the loop
    const currentOverdueMap = new Map();
    for (const t of currentContext.todoist_overdue) {
      if (typeof t.id === "string" && !currentOverdueMap.has(t.id)) {
        currentOverdueMap.set(t.id, t);
      }
    }

    for (const id of currOverdue) {
      if (prevOverdue.has(id)) continue;
      const task = currentOverdueMap.get(id);
      const label = task && typeof task.content === "string" ? task.content : id;
      changesSinceLastVisit.push({
        kind: "new_overdue",
        title: `New overdue task: ${label}`,
      });
    }

    const insightsPrev = buildTodayInsights(previousSnapshot);
    const prevConf = conflictRiskIds(insightsPrev);
    const currConf = conflictRiskIds(todayInsights);
    for (const id of currConf) {
      if (prevConf.has(id)) continue;
      const risk = todayInsights.risks.find((r) => r.id === id);
      changesSinceLastVisit.push({
        kind: "new_calendar_conflict",
        title: risk?.title ?? "New calendar overlap",
        detail: risk?.description,
      });
    }

    const jhPrev = buildJobHuntExpansion(previousSnapshot, nowMs);
    const prevFuNow = new Set(
      jhPrev.followUpTiming.filter((r) => r.status === "follow_up_now").map((r) => r.id),
    );
    const prevFollowUpInsightIds = new Set(insightsPrev.followUps.map((f) => f.id));

    const seenFollowNorm = new Set<string>();
    const pushNewFollowUp = (title: string, detail?: string) => {
      const norm = title
        .toLowerCase()
        .replace(/^follow[-– ]up:?\s*/i, "")
        .replace(/^follow-up now:\s*/i, "")
        .trim();
      if (!norm || seenFollowNorm.has(norm)) return;
      seenFollowNorm.add(norm);
      changesSinceLastVisit.push({
        kind: "new_follow_up",
        title,
        detail,
      });
    };

    for (const row of jobHunt.followUpTiming) {
      if (row.status !== "follow_up_now") continue;
      if (prevFuNow.has(row.id)) continue;
      pushNewFollowUp(`Follow-up now: ${row.subject}`, row.summary);
    }

    for (const f of todayInsights.followUps) {
      if (prevFollowUpInsightIds.has(f.id)) continue;
      pushNewFollowUp(f.title, f.explanation);
    }
  }

  const recommendedActions = buildRecommendedActions(changesSinceLastVisit, dailySynthesis.actionNow);

  return {
    morningBriefing,
    changesSinceLastVisit,
    recommendedActions,
  };
}
