import type { RawJob } from "../types/job.js";
import { jobsFromRssUrls, rssUrlsFor } from "./rss-common.js";

export async function fetchCompanyCareerJobs(): Promise<RawJob[]> {
  const urls = rssUrlsFor("JOB_HUNT_COMPANY_RSS_URLS");
  return jobsFromRssUrls(urls, "company", 400);
}
