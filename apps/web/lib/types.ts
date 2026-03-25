export type TodoistTask = Record<string, unknown>;

export type GmailSignal = {
  id: string | null;
  threadId: string | null;
  from: string;
  subject: string;
  snippet: string;
  date: string;
};

export type CalendarEvent = {
  id: string | null;
  summary: string;
  start: string | null;
  end: string | null;
  location: string | null;
};

export type MyAssistDailyContext = {
  generated_at: string;
  run_date: string;
  todoist_overdue: TodoistTask[];
  todoist_due_today: TodoistTask[];
  todoist_upcoming_high_priority: TodoistTask[];
  gmail_signals: GmailSignal[];
  calendar_today: CalendarEvent[];
};

export type SituationBrief = {
  pressure_summary: string;
  top_priorities: string[];
  conflicts_and_risks: string[];
  defer_recommendations: string[];
  next_actions: string[];
  confidence_and_limits: string;
  memory_insights: string[];
};
