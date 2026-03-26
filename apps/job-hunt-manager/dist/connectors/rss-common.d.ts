import type { JobSource, RawJob } from "../types/job.js";
export declare function rssUrlsFor(sourceEnvKey: string): string[];
export declare function jobsFromRssUrls(urls: string[], source: JobSource, delayMs: number): Promise<RawJob[]>;
