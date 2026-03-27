import type { JobSource, RawJob, UnifiedJob } from "../types/job.js";
export declare function makeJobId(source: JobSource, url: string, title: string): string;
export declare function inferJobType(text: string): "permanent" | "contract" | "unknown";
export declare function inferRemote(text: string): boolean;
export declare function rawToUnified(raw: RawJob, explicitId?: string): UnifiedJob;
