import type { GmailPhaseBSignal, GmailPhaseBSignalType } from "./integrations/gmailSignalDetection";

export type TodoistTaskPreview = {
  id: string;
  content: string;
  description: string | null;
  dueDate: string | null;
  dueDatetime: string | null;
  priority: 1 | 2 | 3 | 4;
  projectId: string | null;
  projectName?: string | null;
  labels: string[];
  isOverdue: boolean;
  isToday: boolean;
  source: "todoist";
};

export type TodoistTask = Record<string, unknown> & Partial<TodoistTaskPreview>;

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
  /** Gmail API label ids for this message (e.g. includes UNREAD when unread). */
  label_ids?: string[];
  importance_score?: number;
  importance_reason?: string;
  importance_model?: string;
  /** Heuristic job-hunt classification; omitted when no confident match. */
  job_hunt_analysis?: JobHuntAnalysis;
  /** Rule-based Phase B signals (deterministic; no LLM). */
  phase_b_signals?: GmailPhaseBSignal[];
};

export type CalendarEvent = {
  id: string | null;
  /** Display title (mirrors Google `summary`). */
  summary: string;
  /** Canonical alias for `summary` (same value). */
  title?: string;
  start: string | null;
  end: string | null;
  location: string | null;
  allDay?: boolean;
  attendeesCount?: number;
  status?: string | null;
  organizer?: string | null;
  meetingLinkPresent?: boolean;
  /** Provider that produced this row (read path). */
  source?: "google_calendar";
};

/** Deterministic calendar signals for the bounded preview window (no ML). */
export type CalendarSignalType =
  | "next_meeting"
  | "meeting_today"
  | "interview_like_event"
  | "scheduling_conflict"
  | "focus_block"
  | "travel_buffer_needed"
  | "calendar_busy_day";

export type CalendarSignal = {
  type: CalendarSignalType;
  detail?: string;
  eventIds?: string[];
};

export type CalendarIntelligence = {
  signals: CalendarSignal[];
  /** Short deterministic summary for UI and prompts. */
  summary: string;
  counts: {
    eventsInWindow: number;
    timedEventsInWindow: number;
    /** Minutes from `now` until next timed event start after now, if any. */
    minutesUntilNextMeeting: number | null;
  };
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

/** Deterministic daily triage + optional ai-core one-liner (see `dailyIntelligence.ts`). */
export type DailyIntelligenceSummary = {
  countsByType: Partial<Record<GmailPhaseBSignalType, number>>;
  topPriorities: string[];
  generatedDeterministicSummary: string;
  aiSummary?: string;
};

export type DailyIntelligence = {
  urgent: GmailSignal[];
  important: GmailSignal[];
  action_required: GmailSignal[];
  job_related: GmailSignal[];
  calendar_related: GmailSignal[];
  summary: DailyIntelligenceSummary;
};

export type UnifiedDailyBriefing = {
  urgent: string[];
  important: string[];
  action_required: string[];
  job_related: string[];
  /** Calendar events in the current window (same length as `calendar_today` in context). */
  calendar_events_in_view: number;
  schedule_summary: string;
  tasks_summary: string;
  email_summary: string;
  summary: string;
  aiSummary?: string;
  counts: {
    urgent: number;
    important: number;
    action_required: number;
    job_related: number;
  };
};

/** Executive-style greeting line derived from `UnifiedDailyBriefing` (deterministic + optional ai-core one-liner). */
export type GoodMorningMessage = {
  message: string;
  tone: "neutral";
  generatedAt: string;
};

export type MyAssistDailyContext = {
  generated_at: string;
  run_date: string;
  todoist_overdue: TodoistTask[];
  todoist_due_today: TodoistTask[];
  todoist_upcoming_high_priority: TodoistTask[];
  gmail_signals: GmailSignal[];
  calendar_today: CalendarEvent[];
  /** Deterministic scheduling intelligence for `calendar_today` window. */
  calendar_intelligence?: CalendarIntelligence;
  user_task_nudges?: Record<string, "up" | "down">;
  /** Present after server-side match against saved leads in job-hunt-manager */
  job_hunt_email_matches?: JobHuntEmailMatch[];
  /** Phase B: buckets + deterministic summary; optional `aiSummary` when MYASSIST_DAILY_INTEL_AI is enabled. */
  daily_intelligence?: DailyIntelligence;
  todoist_intelligence?: TodoistIntelligence;
  unified_daily_briefing?: UnifiedDailyBriefing;
  good_morning_message?: GoodMorningMessage;
};

export type TodoistSignalType =
  | "overdue_task"
  | "due_today"
  | "high_priority_task"
  | "job_search_task"
  | "follow_up_task"
  | "blocked_task"
  | "task_heavy_day";

export type TodoistSignal = {
  type: TodoistSignalType;
  detail: string;
  taskIds?: string[];
};

export type TodoistIntelligence = {
  signals: TodoistSignal[];
  counts: {
    total: number;
    overdue: number;
    dueToday: number;
    highPriority: number;
  };
  summary: string;
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
