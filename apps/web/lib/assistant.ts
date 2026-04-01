import { buildDailySynthesisFromContext } from "./services/dailySynthesisService";
import type { CommunicationDraftType } from "./services/communicationDraftService";
import { buildCalendarIntelligencePromptBlock } from "./calendarIntelligencePrompt";
import { buildDailyIntelligencePromptBlock } from "./dailyIntelligencePrompt";
import type { MyAssistDailyContext, SituationBrief, TodoistTask } from "./types";

export type { CommunicationDraftType } from "./services/communicationDraftService";
export type { CommunicationDraftResult, DraftLanguage } from "./services/communicationDraftService";
export { buildCommunicationDraft } from "./services/communicationDraftService";

/** Short assistant line when a deterministic comms draft is injected (not sent). */
export function buildCommunicationDraftAssistantIntro(
  draftType: CommunicationDraftType,
  lang: "en" | "fr",
  sourceHint?: string,
): string {
  const hint = sourceHint?.trim() ? ` (${sourceHint.trim()})` : "";
  if (lang === "fr") {
    const typeFr =
      draftType === "follow_up"
        ? "relance"
        : draftType === "interview_accept"
          ? "confirmation d'entrevue"
          : draftType === "interview_reschedule"
            ? "report d'entrevue"
            : "remerciement";
    return `Brouillon (${typeFr}) — rien n'a été envoyé.${hint} Copiez le sujet et le corps dans Gmail quand vous êtes prêt.`;
  }
  const typeEn =
    draftType === "follow_up"
      ? "follow-up"
      : draftType === "interview_accept"
        ? "interview confirmation"
        : draftType === "interview_reschedule"
          ? "reschedule request"
          : "thank-you";
  return `Draft (${typeEn}) — nothing was sent.${hint} Copy subject and body into Gmail when ready.`;
}

export type AssistantMode = "ollama" | "fallback";

export type TaskDraft = {
  content: string;
  dueString?: string | null;
  description?: string | null;
  priority?: 1 | 2 | 3 | 4 | null;
};

export type AssistantReply = {
  mode: AssistantMode;
  answer: string;
  actions: string[];
  followUps: string[];
  taskDraft?: TaskDraft | null;
};

function taskTitle(task: TodoistTask | undefined): string | null {
  if (!task) return null;
  return typeof task.content === "string" ? task.content : null;
}

function firstName(from: string): string {
  const cleaned = from.replace(/".*?"/g, "").replace(/<.*?>/g, "").trim();
  return cleaned || from;
}

function safeDateValue(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

function dedupePromptLines(items: string[]): string[] {
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

export function buildSuggestedPrompts(context: MyAssistDailyContext): string[] {
  const prompts: string[] = [
    "What should I focus on first today?",
    "What can I safely defer?",
    "Summarize my day like a chief of staff.",
  ];

  const briefing = context.unified_daily_briefing;
  if (briefing !== undefined && briefing.counts.action_required > 0) {
    prompts.push("How do I triage the action-required pile without losing the day?");
  }
  if (briefing !== undefined && briefing.counts.urgent > 0) {
    prompts.push("What belongs in the urgent email bucket first?");
  }
  if (context.calendar_today.length > 4) {
    prompts.push("How do I protect time between these calendar blocks?");
  }

  const overdue = taskTitle(context.todoist_overdue[0]);
  const dueToday = taskTitle(context.todoist_due_today[0]);
  const signal = context.gmail_signals[0]?.subject;

  if (overdue) prompts.push(`Help me clear this overdue item: ${overdue}`);
  if (dueToday) prompts.push(`How should I handle this due-today task: ${dueToday}`);
  if (signal) prompts.push(`How urgent is this email thread: ${signal}?`);

  return dedupePromptLines(prompts).slice(0, 5);
}

export function buildWelcomeReply(context: MyAssistDailyContext): AssistantReply {
  const syn = buildDailySynthesisFromContext(context);
  const urgentTotal = context.todoist_overdue.length + context.todoist_due_today.length;
  const thinSnapshot =
    urgentTotal === 0 && context.gmail_signals.length === 0 && context.calendar_today.length === 0;

  const focusLine =
    syn.topPriorities.length > 0 ? `Priority: ${syn.topPriorities.slice(0, 2).join(" · ")}.` : "";
  let answer = [syn.oneLineSummary, focusLine].filter(Boolean).join(" ");
  if (thinSnapshot) {
    const thinNote =
      "Snapshot is thin on tasks, calendar, and inbox pulls — refresh connections or open panels if something should be here.";
    answer = answer ? `${answer} ${thinNote}` : thinNote;
  }

  const actions =
    syn.actionNow.length > 0
      ? syn.actionNow.slice(0, 2)
      : syn.topPriorities.slice(0, 2);

  return {
    mode: "fallback",
    answer: answer || "Board loaded. Use the panels for live detail.",
    actions: actions.length > 0 ? actions : buildSuggestedPrompts(context).slice(0, 2),
    followUps: buildSuggestedPrompts(context).slice(0, 2),
    taskDraft: null,
  };
}

export function buildHeadlineFallback(context: MyAssistDailyContext): string {
  const urgent = context.todoist_overdue.length + context.todoist_due_today.length;
  const meetings = context.calendar_today.length;
  const signals = context.gmail_signals.length;

  if (urgent >= 8) {
    return "Heavy load on the task board — clear the drag before new commitments stick.";
  }

  if (urgent > 0 && meetings > 0) {
    return "Tasks and calendar both want attention; lock the next block before the day splinters.";
  }

  if (signals > 6) {
    return "Inbox noise is up — set priorities before answering anything.";
  }

  if (meetings > 4) {
    return "Calendar-dense day; treat gaps as inventory, not leftovers.";
  }

  if (urgent > 0) {
    return "Live obligations on the clock — close them while the runway is still yours.";
  }

  return "Light operational surface — spend it on leverage, not busywork.";
}

export function buildContextDigest(context: MyAssistDailyContext): string {
  const firstEvent = context.calendar_today.find((event) => Boolean(event.start));
  const firstSignal = context.gmail_signals[0];
  const dailyIntel = buildDailyIntelligencePromptBlock(context);
  const calendarIntel = buildCalendarIntelligencePromptBlock(context);
  const todoistIntel = context.todoist_intelligence
    ? {
        counts: context.todoist_intelligence.counts,
        signals: context.todoist_intelligence.signals.slice(0, 6),
        summary: context.todoist_intelligence.summary,
      }
    : null;
  const unifiedBriefing = context.unified_daily_briefing
    ? {
        counts: context.unified_daily_briefing.counts,
        urgent: context.unified_daily_briefing.urgent.slice(0, 4),
        important: context.unified_daily_briefing.important.slice(0, 4),
        action_required: context.unified_daily_briefing.action_required.slice(0, 4),
        job_related: context.unified_daily_briefing.job_related.slice(0, 4),
        summary: context.unified_daily_briefing.summary,
        ...(context.unified_daily_briefing.aiSummary
          ? { aiSummary: context.unified_daily_briefing.aiSummary }
          : {}),
      }
    : null;
  const digest = {
    run_date: context.run_date,
    urgent_counts: {
      overdue: context.todoist_overdue.length,
      due_today: context.todoist_due_today.length,
      calendar_events: context.calendar_today.length,
      gmail_signals: context.gmail_signals.length,
    },
    overdue: context.todoist_overdue.slice(0, 3).map((task) => ({
      content: taskTitle(task),
      priority: typeof task.priority === "number" ? task.priority : null,
      due: typeof (task.due as { datetime?: string; date?: string } | undefined)?.datetime === "string"
        ? (task.due as { datetime?: string }).datetime
        : typeof (task.due as { date?: string } | undefined)?.date === "string"
          ? (task.due as { date?: string }).date
          : null,
    })),
    due_today: context.todoist_due_today.slice(0, 3).map((task) => ({
      content: taskTitle(task),
      priority: typeof task.priority === "number" ? task.priority : null,
    })),
    strategic: context.todoist_upcoming_high_priority.slice(0, 2).map((task) => ({
      content: taskTitle(task),
      priority: typeof task.priority === "number" ? task.priority : null,
    })),
    next_event: firstEvent
      ? {
          summary: firstEvent.summary,
          start: firstEvent.start,
          location: firstEvent.location,
        }
      : null,
    top_email_signal: firstSignal
      ? {
          from: firstName(firstSignal.from),
          subject: firstSignal.subject,
          snippet: firstSignal.snippet.slice(0, 160),
        }
      : null,
    ...(dailyIntel ? { daily_intelligence: dailyIntel } : {}),
    ...(calendarIntel ? { calendar_intelligence: calendarIntel } : {}),
    ...(todoistIntel ? { todoist_intelligence: todoistIntel } : {}),
    ...(unifiedBriefing ? { unified_daily_briefing: unifiedBriefing } : {}),
    ...(context.good_morning_message
      ? {
          good_morning_message: {
            message: context.good_morning_message.message,
            tone: context.good_morning_message.tone,
            generatedAt: context.good_morning_message.generatedAt,
          },
        }
      : {}),
  };

  return JSON.stringify(digest, null, 2);
}

export function buildSituationDigest(context: MyAssistDailyContext): string {
  const overdue = context.todoist_overdue.slice(0, 14).map((task) => ({
    content: taskTitle(task),
    priority: typeof task.priority === "number" ? task.priority : null,
    due: typeof (task.due as { date?: string } | undefined)?.date === "string"
      ? (task.due as { date?: string }).date
      : null,
  }));
  const dueToday = context.todoist_due_today.slice(0, 12).map((task) => ({
    content: taskTitle(task),
    priority: typeof task.priority === "number" ? task.priority : null,
  }));
  const strategic = context.todoist_upcoming_high_priority.slice(0, 12).map((task) => ({
    content: taskTitle(task),
    priority: typeof task.priority === "number" ? task.priority : null,
  }));
  const events = [...context.calendar_today]
    .sort((a, b) => safeDateValue(a.start) - safeDateValue(b.start))
    .slice(0, 24)
    .map((event) => ({
      summary: event.summary,
      start: event.start,
      end: event.end,
      location: event.location,
      calendar: typeof (event as Record<string, unknown>).calendar === "string"
        ? (event as Record<string, unknown>).calendar
        : null,
    }));
  const emailSignals = [...context.gmail_signals]
    .sort((a, b) => safeDateValue(a.date) - safeDateValue(b.date))
    .slice(0, 30)
    .map((signal) => ({
      from: firstName(signal.from),
      subject: signal.subject,
      date: signal.date,
      snippet: signal.snippet.slice(0, 180),
    }));

  const digest = {
    run_date: context.run_date,
    generated_at: context.generated_at,
    counts: {
      overdue: context.todoist_overdue.length,
      due_today: context.todoist_due_today.length,
      strategic_tasks: context.todoist_upcoming_high_priority.length,
      calendar_events: context.calendar_today.length,
      email_signals: context.gmail_signals.length,
    },
    tasks: {
      overdue,
      due_today: dueToday,
      strategic,
    },
    calendar: events,
    email_signals: emailSignals,
  };

  return JSON.stringify(digest, null, 2);
}

export function buildSituationBriefFallback(context: MyAssistDailyContext): SituationBrief {
  const topOverdue = taskTitle(context.todoist_overdue[0]);
  const topDue = taskTitle(context.todoist_due_today[0]);
  const topEvent = context.calendar_today.find((event) => Boolean(event.start));
  const topEmail = context.gmail_signals[0];

  const priorities = [topOverdue, topDue, topEvent?.summary, topEmail?.subject]
    .filter((value): value is string => Boolean(value))
    .slice(0, 4);

  return {
    pressure_summary:
      context.todoist_overdue.length + context.todoist_due_today.length >= 6
        ? "High load across Todoist and commitments — triage before Gmail pulls you sideways."
        : "Moderate pressure; defend one priority block before reactive work expands.",
    top_priorities:
      priorities.length > 0
        ? priorities
        : ["Define one meaningful work block before reactive tasks."],
    conflicts_and_risks: [
      context.calendar_today.length > 8
        ? "Calendar density can fragment focus if no protected work block is reserved."
        : "Calendar appears manageable, but confirm transitions and prep time.",
      context.gmail_signals.length > 20
        ? "Inbox volume is high; avoid broad cleanup and isolate only high-signal threads."
        : "Inbox pressure is present; answer only threads tied to active commitments.",
    ],
    defer_recommendations: [
      "Defer non-urgent inbox cleanup into a single batch window.",
      "Defer low-value admin until overdue and due-today items are stable.",
    ],
    next_actions: [
      topOverdue ? `Close overdue: ${topOverdue}` : "Close one overdue item first.",
      topDue ? `Protect time for: ${topDue}` : "Schedule the top due-today obligation.",
      topEvent?.summary ? `Prepare for: ${topEvent.summary}` : "Set one 45-minute focus block.",
    ],
    confidence_and_limits:
      "Built only from the current task, calendar, and Gmail snapshot — no guessing beyond that.",
    memory_insights: [],
  };
}

export function buildFallbackReply(context: MyAssistDailyContext, question: string): AssistantReply {
  const draft = buildTaskDraftFromMessage(question);
  if (draft) {
    return {
      mode: "fallback",
      answer: `Todoist draft below — nothing written yet. Tweak it, then create when it matches what you meant.`,
      actions: ["Create this task", "Refine the wording"],
      followUps: ["Make it more specific.", "Add a due time."],
      taskDraft: draft,
    };
  }

  const q = question.toLowerCase();
  const topOverdue = taskTitle(context.todoist_overdue[0]);
  const topDue = taskTitle(context.todoist_due_today[0]);
  const topMeeting = context.calendar_today.find((item) => item.start);
  const topSignal = context.gmail_signals[0];

  if (q.includes("focus") || q.includes("first") || q.includes("priorit")) {
    return {
      mode: "fallback",
      answer: topOverdue
        ? `Lead with ${topOverdue} — it is overdue, and clearing it stops drag from compounding.`
        : topDue
          ? `Lead with ${topDue}; it is due today and needs a bounded block before the calendar and inbox pile on.`
          : "No burning task in this snapshot — carve one deep block before admin and email eat the day.",
      actions: [topOverdue ?? topDue ?? "Block 45 minutes for deep work", topMeeting?.summary ?? "Confirm the next calendar anchor"].filter(
        (value): value is string => Boolean(value),
      ).slice(0, 2),
      followUps: ["What can I safely defer?", "How tight is my inbox right now?"],
      taskDraft: null,
    };
  }

  if (q.includes("defer") || q.includes("later") || q.includes("not now")) {
    return {
      mode: "fallback",
      answer:
        context.gmail_signals.length > 5
          ? "Park bulk inbox sweeps. Answer the highest-signal Gmail thread first; batch the rest."
          : "Park low-value admin until overdue and due-today Todoist work is honest.",
      actions: ["Batch inbox into one window", "No new commitments until triage is done"],
      followUps: ["Which thread is the real signal?", "Summarize my day like a chief of staff."],
      taskDraft: null,
    };
  }

  if (q.includes("email") || q.includes("gmail") || q.includes("inbox")) {
    return {
      mode: "fallback",
      answer: topSignal
        ? `Top Gmail signal: "${topSignal.subject}" (${firstName(topSignal.from)}). Open that thread first — not every ping.`
        : "No strong Gmail signal in this pull; inbox may be quiet or sync may need a refresh.",
      actions: topSignal ? [`Open: ${topSignal.subject}`] : [],
      followUps: ["What should I focus on first today?", "What can I safely defer?"],
      taskDraft: null,
    };
  }

  if (q.includes("meeting") || q.includes("calendar") || q.includes("schedule")) {
    return {
      mode: "fallback",
      answer: topMeeting
        ? `Next calendar anchor: ${topMeeting.summary}. Let it bookend your first work slice.`
        : "Calendar looks open in this snapshot — use the white space for proactive Todoist work, not drift.",
      actions: topMeeting ? [`Prep: ${topMeeting.summary}`] : ["Block proactive work on the calendar"],
      followUps: ["What should I finish before that meeting?", "Summarize my day like a chief of staff."],
      taskDraft: null,
    };
  }

  return {
    mode: "fallback",
    answer: buildWelcomeReply(context).answer,
    actions: buildWelcomeReply(context).actions,
    followUps: buildSuggestedPrompts(context).slice(0, 2),
    taskDraft: null,
  };
}

function buildTaskDraftFromMessage(message: string): TaskDraft | null {
  const raw = message.trim();
  const normalized = raw.toLowerCase();
  const looksLikeCreate =
    normalized.startsWith("create a task") ||
    normalized.startsWith("create task") ||
    normalized.startsWith("add a task") ||
    normalized.startsWith("add task") ||
    normalized.startsWith("remind me to") ||
    normalized.startsWith("create todo") ||
    normalized.includes("create a todoist task") ||
    normalized.includes("add this as a task");

  if (!looksLikeCreate) return null;

  let content = raw
    .replace(/^create a todoist task to\s+/i, "")
    .replace(/^create a task to\s+/i, "")
    .replace(/^create task to\s+/i, "")
    .replace(/^create a task\s+/i, "")
    .replace(/^create task\s+/i, "")
    .replace(/^add a task to\s+/i, "")
    .replace(/^add task to\s+/i, "")
    .replace(/^add a task\s+/i, "")
    .replace(/^add task\s+/i, "")
    .replace(/^remind me to\s+/i, "")
    .replace(/^create todo\s+/i, "")
    .trim();

  let dueString: string | null = null;
  const duePatterns = [
    { regex: /\bthis afternoon\b/i, value: "today at 3pm" },
    { regex: /\btomorrow(?: at [^,.]+)?\b/i, valueFromMatch: true },
    { regex: /\bnext week\b/i, value: "in 7 days at 9am" },
    { regex: /\btonight\b/i, value: "today at 7pm" },
    { regex: /\btoday(?: at [^,.]+)?\b/i, valueFromMatch: true },
    { regex: /\bnext monday(?: at [^,.]+)?\b/i, valueFromMatch: true },
    { regex: /\bmonday(?: at [^,.]+)?\b/i, valueFromMatch: true },
    { regex: /\btuesday(?: at [^,.]+)?\b/i, valueFromMatch: true },
    { regex: /\bwednesday(?: at [^,.]+)?\b/i, valueFromMatch: true },
    { regex: /\bthursday(?: at [^,.]+)?\b/i, valueFromMatch: true },
    { regex: /\bfriday(?: at [^,.]+)?\b/i, valueFromMatch: true },
  ];

  for (const pattern of duePatterns) {
    const match = content.match(pattern.regex);
    if (match) {
      const resolved =
        "valueFromMatch" in pattern && pattern.valueFromMatch ? match[0] ?? null : pattern.value ?? null;
      dueString = resolved;
      content = content.replace(pattern.regex, "").replace(/\s{2,}/g, " ").trim();
      break;
    }
  }

  if (dueString) {
    dueString = dueString
      .replace(/\bwith high priority\b/i, "")
      .replace(/\bhigh priority\b/i, "")
      .replace(/\btop priority\b/i, "")
      .replace(/\burgent\b/i, "")
      .replace(/\bp1\b/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  let priority: 1 | 2 | 3 | 4 | null = null;
  const p1 = /\bp1\b|high priority|top priority|urgent/i;
  const p2 = /\bp2\b|medium priority/i;
  const p3 = /\bp3\b|low priority/i;
  const p4 = /\bp4\b|lowest priority/i;
  if (p1.test(raw)) priority = 1;
  else if (p2.test(raw)) priority = 2;
  else if (p3.test(raw)) priority = 3;
  else if (p4.test(raw)) priority = 4;

  content = content.replace(/\bwith priority\b.*$/i, "").trim();
  content = content.replace(/\s{2,}/g, " ").replace(/[.,]$/, "").trim();

  if (!content) return null;

  return {
    content,
    dueString,
    description: null,
    priority,
  };
}
