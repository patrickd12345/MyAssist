import type { UnifiedJob } from "../types/job.js";

export function dedupeJobs(jobs: UnifiedJob[]): UnifiedJob[] {
  const byFp = new Map<string, UnifiedJob>();
  for (const j of jobs) {
    const fp = j._fingerprint ?? j.id;
    const existing = byFp.get(fp);
    if (!existing) {
      byFp.set(fp, j);
      continue;
    }
    const rank = (x: UnifiedJob) => (x.url.startsWith("http") ? 1 : 0) + (x.description.length > 80 ? 1 : 0);
    if (rank(j) > rank(existing)) {
      byFp.set(fp, j);
    }
  }
  return [...byFp.values()];
}
