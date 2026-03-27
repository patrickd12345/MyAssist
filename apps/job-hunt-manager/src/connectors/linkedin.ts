import { rssUrlsFor } from "./rss-common.js";
import { fetchLinkedInGuestJobsForUrl } from "./linkedin-guest-scrape.js";
import type { RawJob } from "../types/job.js";

const DELAY_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Pulls LinkedIn jobs via the public guest search API (HTML cards), not RSS.
 * Configure URLs under JOB_HUNT_LINKEDIN_RSS_URLS / rss-sources.json — any LinkedIn
 * jobs search or old RSS URL with keywords/location query params is supported.
 */
export async function fetchLinkedInJobs(): Promise<RawJob[]> {
  const urls = rssUrlsFor("JOB_HUNT_LINKEDIN_RSS_URLS");
  const out: RawJob[] = [];
  for (let i = 0; i < urls.length; i++) {
    if (i > 0 && DELAY_MS > 0) {
      await delay(DELAY_MS);
    }
    const batch = await fetchLinkedInGuestJobsForUrl(urls[i]);
    out.push(...batch);
  }
  return out;
}
