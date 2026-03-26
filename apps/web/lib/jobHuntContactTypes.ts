export type JobHuntContactSource = "notes_ai_parse" | "manual";

export type JobHuntPersonContact = {
  id: string;
  /** Primary posting id when known; may be empty for rolodex-only contacts. */
  job_id: string;
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
  company?: string;
  source: JobHuntContactSource;
  created_at: string;
  /** Additional saved job ids (e.g. same person across postings). */
  linked_job_ids?: string[];
};
