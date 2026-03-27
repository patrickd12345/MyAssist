const STAGE_WEIGHT = {
    lead: 10,
    applied: 18,
    waiting_call: 28,
    interview_scheduled: 42,
    interviewed: 58,
    offer: 82,
    closed_lost: 5,
    closed_won: 95,
};
export function computeSigningProbability(input) {
    const factors = [];
    let score = STAGE_WEIGHT[input.stage] ?? 20;
    factors.push(`stage:${input.stage}:${STAGE_WEIGHT[input.stage]}`);
    const incoming = input.touchpoints.filter((t) => t.direction === "incoming");
    if (incoming.length >= 2) {
        score += 6;
        factors.push("incoming_responsiveness:+6");
    }
    else if (incoming.length === 1) {
        score += 3;
        factors.push("single_inbound:+3");
    }
    if (input.applied_at) {
        const days = (Date.now() - Date.parse(input.applied_at)) / 86400000;
        if (days > 21 && input.stage === "applied") {
            score -= 8;
            factors.push("stale_applied:-8");
        }
    }
    if (typeof input.override_delta === "number") {
        score += input.override_delta;
        factors.push(`override:${input.override_delta}`);
    }
    score = Math.max(0, Math.min(100, Math.round(score)));
    return { score, factors };
}
