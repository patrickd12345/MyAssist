import type { UnifiedJob } from "../types/job.js";

const MAX_CANDIDATES = 40;

function rankMatch(job: UnifiedJob, q: string, ql: string): number | null {
  if (job.id === q) return 100;
  if (job.id.toLowerCase() === ql) return 98;
  if (job.id.toLowerCase().includes(ql)) return 72;
  const urlLc = job.url.toLowerCase();
  if (urlLc.includes(ql)) return 78;
  if (/^\d{6,}$/.test(q)) {
    const viewRe = new RegExp(`/view/${q}(?:\\?|$|/)`, "i");
    const currentRe = new RegExp(`currentJobId=${q}\\b`, "i");
    const jobsViewRe = new RegExp(`/jobs/view/${q}(?:\\?|$|/)`, "i");
    if (viewRe.test(job.url) || currentRe.test(job.url) || jobsViewRe.test(job.url)) return 85;
  }
  return null;
}

export function resolveJobCandidatesInIndex(jobIndex: Record<string, UnifiedJob>, raw: string): UnifiedJob[] {
  const q = raw.trim();
  if (!q) return [];

  const direct = jobIndex[q];
  if (direct) return [direct];

  const ql = q.toLowerCase();
  const jobs = Object.values(jobIndex);
  const best = new Map<string, { job: UnifiedJob; score: number }>();

  for (const j of jobs) {
    const s = rankMatch(j, q, ql);
    if (s === null) continue;
    const prev = best.get(j.id);
    if (!prev || s > prev.score) best.set(j.id, { job: j, score: s });
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.job.title.localeCompare(b.job.title))
    .slice(0, MAX_CANDIDATES)
    .map((x) => x.job);
}
