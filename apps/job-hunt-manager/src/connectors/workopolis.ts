import type { RawJob } from "../types/job.js";
import { jobsFromRssUrls, rssUrlsFor } from "./rss-common.js";

export async function fetchWorkopolisJobs(): Promise<RawJob[]> {
  const urls = rssUrlsFor("JOB_HUNT_WORKOPOLIS_RSS_URLS");
  return jobsFromRssUrls(urls, "workopolis", 400);
}
