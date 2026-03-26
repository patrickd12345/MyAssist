import type { UnifiedJob } from "../types/job.js";
import type { LifecycleState, SavedLead, TouchpointRecord, TranscriptRecord } from "../types/lifecycle.js";
import type { TrackDefinition } from "../types/tracks.js";
export type PersistedStateV1 = {
    version: 1;
    userTracks: TrackDefinition[];
    jobIndex: Record<string, UnifiedJob>;
    saved: Record<string, SavedLead>;
    lifecycle: Record<string, LifecycleState>;
    transcripts: Record<string, TranscriptRecord[]>;
    touchpoints: Record<string, TouchpointRecord[]>;
};
export declare function defaultDataPath(): string;
export declare function emptyState(): PersistedStateV1;
export declare function loadState(path?: string): PersistedStateV1;
export declare function saveState(state: PersistedStateV1, path?: string): void;
