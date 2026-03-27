import "server-only";

import type { UnifiedJob } from "job-hunt-manager/types/job";

export type ResolveJobResponse = {
  ok: true;
  query: string;
  candidates: UnifiedJob[];
  fetched: boolean;
  fetch_not_linkedin: boolean;
};

/**
 * Resolve jobs from the same on-disk store as job-hunt-manager (digest / MCP).
 * Runs inside the Next.js server so LinkedIn fetch works without a separate digest process.
 */
export async function fetchResolveJobFromStore(
  q: string,
  opts: { fetchOnline?: boolean; track?: string },
): Promise<ResolveJobResponse> {
  const { HuntService } = await import("job-hunt-manager/services/hunt-service");
  const { buildLinkedInViewUrlFromQuery } = await import("job-hunt-manager/connectors/linkedin-job-view");

  const dataPath = process.env.JOB_HUNT_DATA_PATH?.trim() || undefined;
  const svc = new HuntService(dataPath);

  let candidates = await svc.resolveJobCandidates(q);
  let fetched = false;
  let fetchNotLinkedin = false;

  if (candidates.length === 0 && opts.fetchOnline) {
    if (!buildLinkedInViewUrlFromQuery(q)) {
      fetchNotLinkedin = true;
    } else {
      const track = opts.track?.trim() || "ai_focus";
      const ingested = await svc.tryIngestLinkedInJobFromQuery(q, track);
      if (ingested) {
        candidates = [ingested];
        fetched = true;
      }
    }
  }

  return {
    ok: true,
    query: q,
    candidates,
    fetched,
    fetch_not_linkedin: fetchNotLinkedin,
  };
}
