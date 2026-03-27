import type { JobHuntPersonContact } from "./jobHuntContactTypes";

/** True when the contact has no primary posting id (empty or whitespace only). */
export function primaryJobIdIsBlank(jobId?: string | null): boolean {
  return jobId == null || String(jobId).trim().length === 0;
}

/** All posting ids for this contact (legacy primary + linked), deduped, order preserved by first seen. */
export function allPostingIdsForContact(p: JobHuntPersonContact): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [p.job_id, ...(p.linked_job_ids ?? [])]) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function contactAppliesToJob(p: JobHuntPersonContact, jobId: string): boolean {
  const j = jobId.trim();
  if (!j) return false;
  return allPostingIdsForContact(p).some((id) => id === j);
}
