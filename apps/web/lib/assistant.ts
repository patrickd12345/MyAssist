import type { MyAssistDailyContext, TodoistTask } from "./types";

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
  const overdue = context.todoist_overdue.length;
  const dueToday = context.todoist_due_today.length;
  const meetings = context.calendar_today.length;
  const signals = context.gmail_signals.length;
  const nextMeeting = context.calendar_today.find((item) => item.start)?.summary;

  const parts = [
    `I am reading ${overdue + dueToday} urgent task items, ${meetings} calendar events, and ${signals} email signals.`,
    nextMeeting ? `Your first visible schedule anchor is ${nextMeeting}.` : "Your schedule looks relatively open from this snapshot.",
    overdue > 0
      ? "The day should start with triage, not inbox drift."
      : "There is room to be more deliberate instead of reactive.",
  ];

  const actions: string[] = [];
  const topOverdue = taskTitle(context.todoist_overdue[0]);
  const topDue = taskTitle(context.todoist_due_today[0]);
  if (topOverdue) actions.push(`Close overdue: ${topOverdue}`);
  if (topDue) actions.push(`Protect time for: ${topDue}`);
  if (nextMeeting) actions.push(`Prepare for: ${nextMeeting}`);

  return {
    mode: "fallback",
    answer: parts.join(" "),
    actions: actions.slice(0, 3),
    followUps: buildSuggestedPrompts(context).slice(0, 3),
    taskDraft: null,
  };
}

export function buildContextDigest(context: MyAssistDailyContext): string {
  const firstEvent = context.calendar_today.find((event) => Boolean(event.start));
  const firstSignal = context.gmail_signals[0];
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
  };

  return JSON.stringify(digest, null, 2);
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
  const topOverdue = taskTitle(context.todoist_overdue[0]);
  const topDue = taskTitle(context.todoist_due_today[0]);
  const topMeeting = context.calendar_today.find((item) => item.start);
  const topSignal = context.gmail_signals[0];

  if (q.includes("focus") || q.includes("first") || q.includes("priorit")) {
    return {
      mode: "fallback",
      answer: topOverdue
        ? `Start with ${topOverdue}. It is already overdue, so closing it removes drag before the day fragments.`
        : topDue
          ? `Start with ${topDue}. It is due today and should get a protected block before meetings and inbox pressure expand.`
          : "No obvious task fire is visible, so start with one meaningful block before admin or email takes over.",
      actions: [topOverdue ?? topDue ?? "Create a 45-minute focus block", topMeeting?.summary ?? "Review the next calendar anchor"].filter(
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
    { regex: /\bnext week\b/i, value: "next monday at 9am" },
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
