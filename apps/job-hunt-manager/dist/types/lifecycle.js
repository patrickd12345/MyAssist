import { z } from "zod";
export const lifecycleStageSchema = z.enum([
    "lead",
    "applied",
    "waiting_call",
    "interview_scheduled",
    "interviewed",
    "offer",
    "closed_lost",
    "closed_won",
]);
