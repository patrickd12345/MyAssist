import type { RawJob } from "../types/job.js";
import { jobsFromRssUrls, rssUrlsFor } from "./rss-common.js";

export async function fetchGenericRssJobs(): Promise<RawJob[]> {
  const urls = rssUrlsFor("JOB_HUNT_RSS_FEEDS");
  return jobsFromRssUrls(urls, "rss", 400);
}
