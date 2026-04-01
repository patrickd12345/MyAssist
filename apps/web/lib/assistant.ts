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

function taskPriorityValue(task: TodoistTask | undefined): number {
  if (!task) return 1;
  return typeof task.priority === "number" ? task.priority : 1;
}

function pickTopTaskByPriority(context: MyAssistDailyContext): TodoistTask | undefined {
  const candidates = [
    ...context.todoist_overdue.map((task, idx) => ({ task, urgency: 3, idx })),
    ...context.todoist_due_today.map((task, idx) => ({ task, urgency: 2, idx })),
    ...context.todoist_upcoming_high_priority.map((task, idx) => ({ task, urgency: 1, idx })),
  ];
  candidates.sort((a, b) => {
    if (a.urgency !== b.urgency) return b.urgency - a.urgency;
    const pa = taskPriorityValue(a.task);
    const pb = taskPriorityValue(b.task);
    if (pa !== pb) return pb - pa;
    return a.idx - b.idx;
  });
  return candidates[0]?.task;
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

export function buildSuggestedPrompts(context: MyAssistDailyContext): string[] {
  const prompts: string[] = [
    "What should I focus on first today?",
    "What can I safely defer?",
    "Summarize my day like a chief of staff.",
  ];

  const overdue = taskTitle(context.todoist_overdue[0]);
  const dueToday = taskTitle(context.todoist_due_today[0]);
  const signal = context.gmail_signals[0]?.subject;

  if (overdue) prompts.push(`Help me clear this overdue item: ${overdue}`);
  if (dueToday) prompts.push(`How should I handle this due-today task: ${dueToday}`);
  if (signal) prompts.push(`How urgent is this email thread: ${signal}?`);

  return prompts.slice(0, 5);
}

export function buildWelcomeReply(context: MyAssistDailyContext): AssistantReply {
  const syn = buildDailySynthesisFromContext(context);
  const focusLine =
    syn.topPriorities.length > 0 ? `Priority: ${syn.topPriorities.slice(0, 2).join(" · ")}.` : "";
  const answer = [syn.oneLineSummary, focusLine].filter(Boolean).join(" ");

  const actions =
    syn.actionNow.length > 0
      ? syn.actionNow.slice(0, 3)
      : syn.topPriorities.slice(0, 3);

  return {
    mode: "fallback",
    answer: answer || "Snapshot loaded; use the panels for detail.",
    actions: actions.length > 0 ? actions : buildSuggestedPrompts(context).slice(0, 3),
    followUps: buildSuggestedPrompts(context).slice(0, 3),
    taskDraft: null,
  };
}

export function buildHeadlineFallback(context: MyAssistDailyContext): string {
  const urgent = context.todoist_overdue.length + context.todoist_due_today.length;
  const meetings = context.calendar_today.length;
  const signals = context.gmail_signals.length;

  if (urgent >= 8) {
    return "Heavy day. Clear urgent drag before taking on new work.";
  }

  if (urgent > 0 && meetings > 0) {
    return "Mixed pressure across tasks and calendar. Protect the next block before the day fragments.";
  }

  if (signals > 6) {
    return "Inbox pressure is rising. Stay out of reactive loops until priorities are set.";
  }

  if (meetings > 4) {
    return "Calendar weight is high. Use the gaps deliberately.";
  }

  if (urgent > 0) {
    return "A few live obligations are on deck. Close them early and keep the day clean.";
  }

  return "The board is relatively clear. Use the runway for meaningful work.";
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
  const topTask = pickTopTaskByPriority(context);
  const topOverdue = taskTitle(context.todoist_overdue[0]);
  const topDue = taskTitle(context.todoist_due_today[0]);
  const topTaskTitle = taskTitle(topTask);
  const topEvent = context.calendar_today.find((event) => Boolean(event.start));
  const topEmail = context.gmail_signals[0];

  const priorities = [topTaskTitle, topOverdue, topDue, topEvent?.summary, topEmail?.subject]
    .filter((value): value is string => Boolean(value))
    .slice(0, 4);

  return {
    pressure_summary:
      context.todoist_overdue.length + context.todoist_due_today.length >= 6
        ? "Operational pressure is high across commitments. Triage before inbox drift."
        : "Pressure is moderate. Protect priority work before reactive tasks expand.",
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
      "This brief is generated from current task, calendar, and email signals only; unseen context may change priorities.",
    memory_insights: [],
  };
}

export function buildFallbackReply(context: MyAssistDailyContext, question: string): AssistantReply {
  const draft = buildTaskDraftFromMessage(question);
  if (draft) {
    return {
      mode: "fallback",
      answer: `I drafted a Todoist task from your request. Review it, then confirm the write if it looks right.`,
      actions: ["Create this task", "Refine the wording", "Adjust the due date"],
      followUps: [
        "Make it more specific.",
        "Add a due time.",
        "Lower the priority.",
      ],
      taskDraft: draft,
    };
  }

  const q = question.toLowerCase();
  const topTask = pickTopTaskByPriority(context);
  const topTaskTitle = taskTitle(topTask);
  const topOverdue = taskTitle(context.todoist_overdue[0]);
  const topDue = taskTitle(context.todoist_due_today[0]);
  const topMeeting = context.calendar_today.find((item) => item.start);
  const topSignal = context.gmail_signals[0];

  if (q.includes("focus") || q.includes("first") || q.includes("priorit")) {
    return {
      mode: "fallback",
      answer: topOverdue
        ? `Start with ${topOverdue}. It is already overdue, so closing it removes drag before the day fragments.`
        : topTaskTitle
          ? `Start with ${topTaskTitle}. Its Todoist priority is elevated in your current task set, so it should be protected before reactive work.`
        : topDue
          ? `Start with ${topDue}. It is due today and should get a protected block before meetings and inbox pressure expand.`
          : "No obvious task fire is visible, so start with one meaningful block before admin or email takes over.",
      actions: [topOverdue ?? topTaskTitle ?? topDue ?? "Create a 45-minute focus block", topMeeting?.summary ?? "Review the next calendar anchor"].filter(
        (value): value is string => Boolean(value),
      ),
      followUps: [
        "What can I safely defer?",
        "How should I handle my email pressure?",
      ],
      taskDraft: null,
    };
  }

  if (q.includes("defer") || q.includes("later") || q.includes("not now")) {
    return {
      mode: "fallback",
      answer:
        context.gmail_signals.length > 5
          ? "Defer broad inbox cleanup and respond only to the highest-signal thread. The rest should stay batched."
          : "Defer low-value admin and preserve your attention for overdue or due-today commitments.",
      actions: [
        "Batch inbox review into one contained window",
        "Avoid adding new commitments before triage is complete",
      ],
      followUps: [
        "Which email thread is the real signal?",
        "Summarize my day like a chief of staff.",
      ],
      taskDraft: null,
    };
  }

  if (q.includes("email") || q.includes("gmail") || q.includes("inbox")) {
    return {
      mode: "fallback",
      answer: topSignal
        ? `The top visible email signal is "${topSignal.subject}" from ${firstName(topSignal.from)}. Treat it as the first thread to evaluate, not a reason to live in the inbox.`
        : "No major email signal is visible in the current pull.",
      actions: topSignal ? [`Review thread: ${topSignal.subject}`] : [],
      followUps: [
        "What should I focus on first today?",
        "What can I safely defer?",
      ],
      taskDraft: null,
    };
  }

  if (q.includes("meeting") || q.includes("calendar") || q.includes("schedule")) {
    return {
      mode: "fallback",
      answer: topMeeting
        ? `Your nearest calendar anchor is ${topMeeting.summary}. Use it as the boundary for your first work block.`
        : "The schedule is relatively open in this snapshot, which gives you room to drive proactive work.",
      actions: topMeeting ? [`Prepare for: ${topMeeting.summary}`] : ["Create a proactive work block"],
      followUps: [
        "What should I finish before that meeting?",
        "Summarize my day like a chief of staff.",
      ],
      taskDraft: null,
    };
  }

  return {
    mode: "fallback",
    answer: buildWelcomeReply(context).answer,
    actions: buildWelcomeReply(context).actions,
    followUps: buildSuggestedPrompts(context).slice(0, 3),
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
