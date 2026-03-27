import { jobsFromRssUrls, rssUrlsFor } from "./rss-common.js";
export async function fetchWorkopolisJobs() {
    const urls = rssUrlsFor("JOB_HUNT_WORKOPOLIS_RSS_URLS");
    return jobsFromRssUrls(urls, "workopolis", 400);
}
