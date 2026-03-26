import type { LifecycleStage, TouchpointRecord } from "../types/lifecycle.js";
export declare function computeSigningProbability(input: {
    stage: LifecycleStage;
    touchpoints: TouchpointRecord[];
    applied_at?: string;
    override_delta?: number;
}): {
    score: number;
    factors: string[];
};
