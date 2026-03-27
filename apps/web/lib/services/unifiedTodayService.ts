import "server-only";

import { createCalendarAdapter, type CalendarEvent } from "@/lib/adapters/calendarAdapter";
import { createGmailAdapter, type GmailMessage } from "@/lib/adapters/gmailAdapter";
import { createTodoistAdapter, type TodoistTask } from "@/lib/adapters/todoistAdapter";

export type UnifiedSource = "gmail" | "google_calendar" | "todoist";
export type UnifiedKind = "email" | "event" | "task";

export type UnifiedItem = {
  id: string;
  source: UnifiedSource;
  kind: UnifiedKind;
  title: string;
  subtitle: string;
  when: string | null;
  url: string | null;
};

export type UnifiedTodaySummary = {
  generatedAt: string;
  total: number;
  emails: number;
  events: number;
  tasks: number;
  providerStatus: Record<UnifiedSource, "ok" | "error">;
};

export type UnifiedTodayPayload = {
  emails: UnifiedItem[];
  events: UnifiedItem[];
  tasks: UnifiedItem[];
  summary: UnifiedTodaySummary;
};

function mapEmailItem(message: GmailMessage): UnifiedItem {
  return {
    id: message.id,
    source: "gmail",
    kind: "email",
    title: message.subject || "(no subject)",
    subtitle: message.from || "Unknown sender",
    when: message.date || message.internalDate,
    url: message.id ? `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(message.id)}` : null,
  };
}

function mapEventItem(event: CalendarEvent): UnifiedItem {
  return {
    id: event.id,
    source: "google_calendar",
    kind: "event",
    title: event.summary || "(untitled event)",
    subtitle: event.location || event.description || "Calendar event",
    when: event.start.dateTime || event.start.date || null,
    url: null,
  };
}

function mapTaskItem(task: TodoistTask): UnifiedItem {
  return {
    id: task.id,
    source: "todoist",
    kind: "task",
    title: task.content || "(untitled task)",
    subtitle: task.description || `Priority ${task.priority}`,
    when: task.due?.datetime || task.due?.date || null,
    url: task.url,
  };
}

export class UnifiedTodayService {
  constructor(
    private readonly deps: {
      gmail: ReturnType<typeof createGmailAdapter>;
      calendar: ReturnType<typeof createCalendarAdapter>;
      todoist: ReturnType<typeof createTodoistAdapter>;
    },
  ) {}

  async getToday(limit = 25): Promise<UnifiedTodayPayload> {
    const [emailsResult, eventsResult, tasksResult] = await Promise.allSettled([
      this.deps.gmail.getToday({ limit }),
      this.deps.calendar.getToday({ limit }),
      this.deps.todoist.getToday({ limit }),
    ]);

    const emails = emailsResult.status === "fulfilled" ? emailsResult.value.map(mapEmailItem) : [];
    const events = eventsResult.status === "fulfilled" ? eventsResult.value.map(mapEventItem) : [];
    const tasks = tasksResult.status === "fulfilled" ? tasksResult.value.map(mapTaskItem) : [];

    return {
      emails,
      events,
      tasks,
      summary: {
        generatedAt: new Date().toISOString(),
        total: emails.length + events.length + tasks.length,
        emails: emails.length,
        events: events.length,
        tasks: tasks.length,
        providerStatus: {
          gmail: emailsResult.status === "fulfilled" ? "ok" : "error",
          google_calendar: eventsResult.status === "fulfilled" ? "ok" : "error",
          todoist: tasksResult.status === "fulfilled" ? "ok" : "error",
        },
      },
    };
  }
}

export function createUnifiedTodayService(userId: string): UnifiedTodayService {
  return new UnifiedTodayService({
    gmail: createGmailAdapter(userId),
    calendar: createCalendarAdapter(userId),
    todoist: createTodoistAdapter(userId),
  });
}
