import type { LifecycleStage, LifecycleState } from "job-hunt-manager/types/lifecycle";

export type DigestPayload = {
  generated_at?: string;
  followups_due_approx?: number;
  by_track?: Record<string, { saved: number; by_stage: Record<string, number> }>;
  tracks?: Array<{ id: string; label: string; kind: string }>;
};

/** Subset of job-hunt-manager UnifiedJob returned by search API. */
export type JobHuntListingRow = {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  source: string;
  url: string;
  posted_date: string | null;
};

export type SavedJobTouchpoint = {
  at: string;
  subject: string;
  body_summary?: string;
  channel: string;
  direction: string;
};

export type SavedJobRow = {
  saved: { job_id: string; track: string; notes?: string; saved_at: string };
  job: JobHuntListingRow | null;
  lifecycle: LifecycleState;
  touchpoints: SavedJobTouchpoint[];
};

export const NEW_TRACK_SELECT_VALUE = "__new_track__";

export const PIPELINE_COLUMNS: { id: string; label: string; stages: LifecycleStage[] }[] = [
  { id: "lead", label: "Lead", stages: ["lead"] },
  { id: "applied", label: "Applied", stages: ["applied"] },
  {
    id: "interviewing",
    label: "Interviewing",
    stages: ["waiting_call", "interview_scheduled", "interviewed"],
  },
  { id: "offer", label: "Offer", stages: ["offer"] },
  { id: "closed", label: "Closed", stages: ["closed_lost", "closed_won"] },
];

export function columnForStage(stage: LifecycleStage): string {
  for (const col of PIPELINE_COLUMNS) {
    if (col.stages.includes(stage)) return col.id;
  }
  return "lead";
}

export function myAssistJobTag(jobId: string): string {
  return `[MA-JOB:${jobId}]`;
}
