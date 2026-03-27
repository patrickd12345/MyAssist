import { fetchLinkedInJobs } from "../connectors/linkedin.js";
import { fetchIndeedJobs } from "../connectors/indeed.js";
import { fetchWorkopolisJobs } from "../connectors/workopolis.js";
import { fetchCompanyCareerJobs } from "../connectors/company-pages.js";
import { fetchLoopCvJobs } from "../connectors/loopcv.js";
import { fetchGenericRssJobs } from "../connectors/generic-rss.js";
export async function aggregateRawJobs() {
    const chunks = await Promise.all([
        fetchLinkedInJobs(),
        fetchIndeedJobs(),
        fetchWorkopolisJobs(),
        fetchCompanyCareerJobs(),
        fetchLoopCvJobs(),
        fetchGenericRssJobs(),
    ]);
    return chunks.flat();
}
