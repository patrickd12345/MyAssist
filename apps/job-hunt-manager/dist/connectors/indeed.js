import { jobsFromRssUrls, rssUrlsFor } from "./rss-common.js";
export async function fetchIndeedJobs() {
    const urls = rssUrlsFor("JOB_HUNT_INDEED_RSS_URLS");
    return jobsFromRssUrls(urls, "indeed", 400);
}
