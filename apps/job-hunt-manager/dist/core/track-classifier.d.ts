import type { UnifiedJob } from "../types/job.js";
import type { TrackDefinition } from "../types/tracks.js";
export declare function classifyTrackForJob(job: UnifiedJob, tracks: TrackDefinition[]): {
    track_guess: string;
    confidence: number;
};
export declare function annotateTrackGuess(job: UnifiedJob, tracks: TrackDefinition[]): UnifiedJob;
