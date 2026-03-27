import type { UnifiedJob } from "../types/job.js";
export type SearchFilters = {
    ai?: boolean;
    sap_bridge?: boolean;
    senior_only?: boolean;
};
export declare function applyDomainFilters(jobs: UnifiedJob[], filters: SearchFilters | undefined): UnifiedJob[];
export declare function applyQueryFilters(jobs: UnifiedJob[], opts: {
    remote?: boolean;
    job_type?: "permanent" | "contract" | "either";
}): UnifiedJob[];
