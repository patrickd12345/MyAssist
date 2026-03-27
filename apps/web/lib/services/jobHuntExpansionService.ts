import type { CalendarEvent, GmailSignal, JobHuntAnalysis, MyAssistDailyContext, TodoistTask } from "@/lib/types";

export type PrepItemId =
  | "research_company"
  | "review_role"
  | "prepare_questions"
  | "test_microphone"
  | "review_resume";

export type PrepItem = { id: PrepItemId; label: string };

const PREP_ITEM_DEFS: Array<{ id: PrepItemId; label: string; taskMatch: RegExp }> = [
  { id: "research_company", label: "Research company", taskMatch: /\b(company|research|glassdoor|crunchbase|competitors|about\s+the\s+firm)\b/i },
  { id: "review_role", label: "Review role / JD", taskMatch: /\b(role|jd|job\s*description|requirements|position|stack)\b/i },
  { id: "prepare_questions", label: "Prepare questions to ask", taskMatch: /\b(question|questions\s+to\s+ask|stump|panel)\b/i },
  { id: "test_microphone", label: "Test microphone / AV", taskMatch: /\b(mic|microphone|audio|zoom|headset|camera|teams|meet)\b/i },
  { id: "review_resume", label: "Review resume", taskMatch: /\b(resume|cv|tailor|highlight)\b/i },
];

const INTERVIEW_EVENT_KW = /\b(interview|onsite|on-?site|loop|screen|technical\s*interview|tech\s*interview)\b/i;

export type PrepRecommendation = {
  id: string;
  source: "gmail" | "calendar";
  contextLabel: string;
  company?: string;
  role?: string;
  /** Gmail message id when `source === "gmail"` (for one-click prep tasks). */
  messageId?: string | null;
  missingItems: PrepItem[];
};

export type FollowUpTimingStatus = "follow_up_now" | "wait" | "monitor";

export type FollowUpTimingRow = {
  id: string;
  subject: string;
  status: FollowUpTimingStatus;
  summary: string;
  daysSinceTouch?: number;
  /** Gmail message id for API actions when present. */
  messageId?: string | null;
};

export type ResearchSuggestionRow = {
  id: string;
  company: string;
  role: string;
  bullets: string[];
};

export type JobHuntExpansionInsights = {
  prepRecommendations: PrepRecommendation[];
  followUpTiming: FollowUpTimingRow[];
  researchSuggestions: ResearchSuggestionRow[];
};

function taskContent(t: TodoistTask): string {
  return typeof t.content === "string" ? t.content : "";
}

function allTodoistTasks(context: MyAssistDailyContext): TodoistTask[] {
  return [
    ...context.todoist_overdue,
    ...context.todoist_due_today,
    ...context.todoist_upcoming_high_priority,
  ];
}

export function coveredPrepItemIds(tasks: TodoistTask[]): Set<PrepItemId> {
  const blob = tasks.map(taskContent).join("\n");
  const out = new Set<PrepItemId>();
  for (const def of PREP_ITEM_DEFS) {
    if (def.taskMatch.test(blob)) out.add(def.id);
  }
  return out;
}

export function missingPrepItems(covered: Set<PrepItemId>): PrepItem[] {
  return PREP_ITEM_DEFS.filter((d) => !covered.has(d.id)).map((d) => ({ id: d.id, label: d.label }));
}

function signalKey(s: GmailSignal): string {
  return s.threadId || s.id || `${s.from}:${s.subject}`;
}

function parseSignalDateMs(signal: GmailSignal): number | null {
  const raw = signal.date?.trim();
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function daysBetweenTouchAndNow(touchMs: number, nowMs: number): number {
  return Math.floor((nowMs - touchMs) / 86_400_000);
}

function wantsInterviewPrep(analysis: JobHuntAnalysis | undefined): boolean {
  if (!analysis?.signals?.length) return false;
  return analysis.signals.includes("interview_request") || analysis.signals.includes("technical_interview");
}

export function evaluateFollowUpTiming(
  signal: GmailSignal,
  analysis: JobHuntAnalysis | undefined,
  nowMs: number,
): FollowUpTimingRow | null {
  if (!analysis?.signals?.length) return null;

  const signals = analysis.signals;
  if (signals.includes("rejection") || signals.includes("offer")) {
    return {
      id: `fu-${signalKey(signal)}`,
      subject: signal.subject || "(no subject)",
      status: "monitor",
      summary: "Offer/rejection thread — no automated nudge.",
    };
  }

  const touchMs = parseSignalDateMs(signal);
  if (touchMs === null) {
    return {
      id: `fu-${signalKey(signal)}`,
      subject: signal.subject || "(no subject)",
      status: "monitor",
      summary: "No parseable email date — review manually.",
    };
  }

  const days = daysBetweenTouchAndNow(touchMs, nowMs);
  const stage = analysis.stageAlias;

  if (signals.includes("follow_up")) {
    if (days >= 7) {
      return {
        id: `fu-${signalKey(signal)}`,
        subject: signal.subject || "(no subject)",
        status: "follow_up_now",
        summary: "Follow-up thread with no recent movement (7+ days since email date).",
        daysSinceTouch: days,
      };
    }
    if (days >= 3) {
      return {
        id: `fu-${signalKey(signal)}`,
        subject: signal.subject || "(no subject)",
        status: "monitor",
        summary: "Watch for a reply soon (3–6 days since email date).",
        daysSinceTouch: days,
      };
    }
    return {
      id: `fu-${signalKey(signal)}`,
      subject: signal.subject || "(no subject)",
      status: "wait",
      summary: "Recent thread — give the other side a little time.",
      daysSinceTouch: days,
    };
  }

  if (signals.includes("interview_request") || signals.includes("technical_interview")) {
    const urgent = stage === "interview" || stage === "technical";
    const high = urgent ? 4 : 6;
    const mid = urgent ? 2 : 3;
    if (days >= high) {
      return {
        id: `fu-${signalKey(signal)}`,
        subject: signal.subject || "(no subject)",
        status: "follow_up_now",
        summary: "Scheduling/interview thread idle — consider a polite ping.",
        daysSinceTouch: days,
      };
    }
    if (days >= mid) {
      return {
        id: `fu-${signalKey(signal)}`,
        subject: signal.subject || "(no subject)",
        status: "monitor",
        summary: "Check for confirmations or next steps.",
        daysSinceTouch: days,
      };
    }
    return {
      id: `fu-${signalKey(signal)}`,
      subject: signal.subject || "(no subject)",
      status: "wait",
      summary: "Recent interview-related mail — wait briefly unless a deadline passed.",
      daysSinceTouch: days,
    };
  }

  if (signals.includes("application_confirmation")) {
    if (days >= 14) {
      return {
        id: `fu-${signalKey(signal)}`,
        subject: signal.subject || "(no subject)",
        status: "monitor",
        summary: "Application acknowledged a while ago — optional light check-in if appropriate.",
        daysSinceTouch: days,
      };
    }
    return {
      id: `fu-${signalKey(signal)}`,
      subject: signal.subject || "(no subject)",
      status: "wait",
      summary: "Fresh application ack — typically wait for their process.",
      daysSinceTouch: days,
    };
  }

  return null;
}

function interviewLikeCalendarEvent(ev: CalendarEvent): boolean {
  return INTERVIEW_EVENT_KW.test(ev.summary || "");
}

export function buildResearchRowsForIdentity(
  company: string | undefined,
  role: string | undefined,
  dedupeKey: string,
): ResearchSuggestionRow | null {
  const c = company?.trim();
  const r = role?.trim();
  if (!c || !r) return null;
  return {
    id: `research-${dedupeKey}`,
    company: c,
    role: r,
    bullets: [
      `Research company background (${c})`,
      `Review role requirements for "${r}"`,
      `Prepare role-specific questions for ${r} at ${c}`,
    ],
  };
}

export function buildJobHuntExpansion(
  context: MyAssistDailyContext,
  nowMs: number = Date.now(),
): JobHuntExpansionInsights {
  const tasks = allTodoistTasks(context);
  const covered = coveredPrepItemIds(tasks);

  const prepRecommendations: PrepRecommendation[] = [];
  const seenPrep = new Set<string>();

  for (const signal of context.gmail_signals) {
    const analysis = signal.job_hunt_analysis;
    if (!wantsInterviewPrep(analysis)) continue;

    const key = `gmail:${signalKey(signal)}`;
    if (seenPrep.has(key)) continue;

    const missing = missingPrepItems(covered);
    if (missing.length === 0) continue;

    seenPrep.add(key);
    const ni = analysis?.normalizedIdentity;
    prepRecommendations.push({
      id: `prep-${key}`,
      source: "gmail",
      contextLabel: signal.subject || "Interview email",
      company: ni?.company,
      role: ni?.role,
      messageId: signal.id?.trim() || null,
      missingItems: missing,
    });
  }

  for (const ev of context.calendar_today) {
    if (!interviewLikeCalendarEvent(ev) || !ev.start) continue;
    const key = `cal:${ev.id ?? ev.summary}`;
    if (seenPrep.has(key)) continue;

    const missing = missingPrepItems(covered);
    if (missing.length === 0) continue;

    seenPrep.add(key);
    prepRecommendations.push({
      id: `prep-${key}`,
      source: "calendar",
      contextLabel: ev.summary || "Interview block",
      missingItems: missing,
    });
  }

  const followUpTiming: FollowUpTimingRow[] = [];
  const seenFu = new Set<string>();
  for (const signal of context.gmail_signals) {
    const a = signal.job_hunt_analysis;
    if (!a?.signals?.length) continue;
    const row = evaluateFollowUpTiming(signal, a, nowMs);
    if (!row) continue;
    if (seenFu.has(row.id)) continue;
    seenFu.add(row.id);
    followUpTiming.push({
      ...row,
      messageId: signal.id?.trim() || null,
    });
  }

  const researchSuggestions: ResearchSuggestionRow[] = [];
  const seenResearch = new Set<string>();
  for (const signal of context.gmail_signals) {
    const ni = signal.job_hunt_analysis?.normalizedIdentity;
    const row = buildResearchRowsForIdentity(ni?.company, ni?.role, signalKey(signal));
    if (!row) continue;
    const dk = `${row.company.toLowerCase()}|${row.role.toLowerCase()}`;
    if (seenResearch.has(dk)) continue;
    seenResearch.add(dk);
    researchSuggestions.push(row);
  }

  return { prepRecommendations, followUpTiming, researchSuggestions };
}
