import type { LifecycleStage } from "job-hunt-manager/types/lifecycle";

/**
 * Short, agreed meanings for pipeline stages (saved-job lifecycle).
 * Shown in the job drawer when picking a stage; keep in sync with job-hunt-manager lifecycle.
 */
export const LIFECYCLE_STAGE_DEFINITIONS = {
  lead:
    "Lead: role is saved and tracked here, but no application has been sent yet (evaluate, prep, or queue).",
  applied:
    "Applied: application or CV has been submitted; waiting on employer, ATS, or recruiter acknowledgment.",
  waiting_call:
    "Waiting on call: expecting a recruiter or hiring manager to reach out (screening, intro, or scheduling).",
  interview_scheduled:
    "Interview scheduled: at least one interview is booked; prep for that conversation.",
  interviewed:
    "Interviewed: at least one interview happened; waiting on feedback, next round, or decision.",
  offer:
    "Offer: a written or verbal offer exists; negotiate, decide, or accept.",
  closed_lost:
    "Closed — lost: process ended without joining (rejection, withdrawal, role filled, or ghosted).",
  closed_won:
    "Closed — won: accepted offer or signed; treat as hired for this pipeline.",
} satisfies Record<LifecycleStage, string>;

export function formatLifecycleStageLabel(stage: LifecycleStage): string {
  return stage
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
