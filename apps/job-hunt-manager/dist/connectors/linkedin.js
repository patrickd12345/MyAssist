import { jobsFromRssUrls, rssUrlsFor } from "./rss-common.js";
export async function fetchLinkedInJobs() {
    const urls = rssUrlsFor("JOB_HUNT_LINKEDIN_RSS_URLS");
    return jobsFromRssUrls(urls, "linkedin", 400);
}
