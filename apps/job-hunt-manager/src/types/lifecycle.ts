import { z } from "zod";

export const lifecycleStageSchema = z.enum([
  "lead",
  "applied",
  "waiting_call",
  "interview_scheduled",
  "interviewed",
  "offer",
  "closed_lost",
  "closed_won",
]);

export type LifecycleStage = z.infer<typeof lifecycleStageSchema>;

export type TimelineEvent = {
  at: string;
  kind: string;
  detail: string;
};

/** Incoming Gmail-style row (from MyAssist daily context) for job matching. */
export type EmailSignalInput = {
  id?: string | null;
  threadId?: string | null;
  from: string;
  subject: string;
  snippet: string;
  date: string;
};

export type TouchpointRecord = {
  at: string;
  channel: "email" | "call" | "linkedin" | "other";
  direction: "incoming" | "outgoing";
  subject: string;
  body_summary?: string;
  /** Dedupe key when touchpoint was created from an email signal (threadId|id|date|subject). */
  signal_ref?: string;
};

export type TranscriptRecord = {
  id: string;
  at: string;
  interview_round?: string;
  summary?: string;
  transcript_ref?: string;
  transcript_text?: string;
  signals?: {
    strengths: string[];
    gaps: string[];
    objections: string[];
    next_actions: string[];
  };
};

export type LifecycleState = {
  job_id: string;
  track: string;
  stage: LifecycleStage;
  next_action?: string;
  next_action_date?: string;
  last_touchpoint_at?: string;
  applied_at?: string;
  signing_probability?: number;
  probability_factors?: string[];
  interview_transcript_refs: string[];
  timeline_events: TimelineEvent[];
  bridge_pitch?: string;
  followups?: { d3: string; d7: string; d14: string };
};

export type SavedLead = {
  job_id: string;
  track: string;
  notes?: string;
  bucket?: string;
  bridge_pitch?: string;
  saved_at: string;
};
