import { type SearchFilters } from "../core/filter.js";
import { type PersistedStateV1 } from "../store/file-store.js";
import type { UnifiedJob } from "../types/job.js";
import type { LifecycleState, SavedLead, TouchpointRecord, TranscriptRecord } from "../types/lifecycle.js";
import { type NewTrackInput, type TrackDefinition } from "../types/tracks.js";
export declare class HuntService {
    private readonly dataPath?;
    constructor(dataPath?: string | undefined);
    private load;
    private persist;
    mergedTracks(state: PersistedStateV1, includeArchived?: boolean): TrackDefinition[];
    getTrack(state: PersistedStateV1, trackId: string): TrackDefinition | undefined;
    createTrack(input: NewTrackInput): TrackDefinition;
    archiveTrack(trackId: string): void;
    listTracks(includeArchived?: boolean): TrackDefinition[];
    resolveTrackOnSave(state: PersistedStateV1, track?: string, newTrack?: NewTrackInput): string;
    searchJobs(args: {
        track: string;
        keywords?: string;
        location?: string;
        remote?: boolean;
        job_type?: "permanent" | "contract" | "either";
        seniority?: string;
        filters?: SearchFilters;
        limit?: number;
    }): Promise<{
        query: Record<string, unknown>;
        total_deduped: number;
        returned: number;
        jobs: UnifiedJob[];
    }>;
    getJob(id: string): {
        job: UnifiedJob | null;
        lifecycle: LifecycleState | null;
        transcripts: TranscriptRecord[];
        touchpoints: TouchpointRecord[];
    };
    saveJob(input: {
        id: string;
        track?: string;
        new_track?: NewTrackInput;
        notes?: string;
        bucket?: string;
        bridge_pitch?: string;
    }): SavedLead;
    markApplied(input: {
        id: string;
        applied_date: string;
        channel?: string;
        notes?: string;
    }): LifecycleState;
    listSavedJobs(input: {
        track?: string;
        status?: LifecycleState["stage"];
        source?: UnifiedJob["source"];
        type?: UnifiedJob["type"];
        only_followup_due?: boolean;
    }): Array<{
        saved: SavedLead;
        job: UnifiedJob | null;
        lifecycle: LifecycleState;
    }>;
    updateJobProgress(input: {
        id: string;
        stage: string;
        next_action?: string;
        next_action_date?: string;
        notes?: string;
        track?: string;
        new_track?: NewTrackInput;
    }): LifecycleState;
    addInterviewTranscript(input: {
        id: string;
        transcript_text?: string;
        transcript_ref?: string;
        interview_round?: string;
        summary?: string;
    }): TranscriptRecord;
    logTouchpoint(input: {
        id: string;
        channel: TouchpointRecord["channel"];
        direction: TouchpointRecord["direction"];
        subject: string;
        body_summary?: string;
    }): TouchpointRecord;
    scoreSigningProbability(input: {
        id: string;
        override_signals?: {
            delta?: number;
        };
    }): {
        score: number;
        factors: string[];
        lifecycle: LifecycleState;
    };
    buildDigest(): Record<string, unknown>;
}
