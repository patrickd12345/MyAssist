export type TodoistTask = Record<string, unknown>;

export type JobHuntSignal =
  | "interview_request"
  | "technical_interview"
  | "follow_up"
  | "offer"
  | "rejection"
  | "application_confirmation";

export type JobHuntAction =
  | "create_prep_task"
  | "create_followup_task"
  | "suggest_calendar_block"
  | "create_interview_event"
  | "update_pipeline";

export type JobHuntStageAlias =
  | "applied"
  | "interview"
  | "technical"
  | "offer"
  | "rejected";

export type JobHuntManagerStageHint =
  | "applied"
  | "interview_scheduled"
  | "waiting_call"
  | "offer"
  | "closed_lost";

export type JobHuntNormalizedIdentity = {
  company?: string;
  role?: string;
  recruiterName?: string;
  threadId?: string;
  messageId?: string;
};

/** Lightweight linkage for calendar events created from job-hunt email flows (no calendar mirroring). */
export type JobHuntCalendarOpportunityLink = {
  sourceMessageId: string;
  sourceThreadId?: string | null;
  calendarEventId: string;
  normalizedIdentity?: JobHuntNormalizedIdentity;
  stageAlias?: JobHuntStageAlias;
};

export type JobHuntAnalysis = {
  signals: JobHuntSignal[];
  confidence: number;
  suggestedActions: JobHuntAction[];
  stageAlias?: JobHuntStageAlias;
  stageHintManager?: JobHuntManagerStageHint;
  normalizedIdentity?: JobHuntNormalizedIdentity;
};

export type GmailSignal = {
  id: string | null;
  threadId: string | null;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  importance_score?: number;
  importance_reason?: string;
  importance_model?: string;
  /** Heuristic job-hunt classification; omitted when no confident match. */
  job_hunt_analysis?: JobHuntAnalysis;
};

export type CalendarEvent = {
  id: string | null;
  summary: string;
  start: string | null;
  end: string | null;
  location: string | null;
};

/** Email ↔ saved job match from job-hunt-manager (POST /signals). */
export type JobHuntEmailMatch = {
  job_id: string;
  company: string;
  title: string;
  match_score: number;
  match_reason: string;
  touchpoint_logged: boolean;
  stage_updated?: string;
  signal: Pick<GmailSignal, "from" | "subject" | "snippet" | "date">;
};

export type MyAssistDailyContext = {
  generated_at: string;
  run_date: string;
  todoist_overdue: TodoistTask[];
  todoist_due_today: TodoistTask[];
  todoist_upcoming_high_priority: TodoistTask[];
  gmail_signals: GmailSignal[];
  calendar_today: CalendarEvent[];
  user_task_nudges?: Record<string, "up" | "down">;
  /** Present after server-side match against saved leads in job-hunt-manager */
  job_hunt_email_matches?: JobHuntEmailMatch[];
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
