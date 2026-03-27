import { z } from "zod";
export type TrackKind = "builtin" | "user";
export type JobTypeHint = "permanent" | "contract" | "either";
export type TrackDefinition = {
    id: string;
    label: string;
    kind: TrackKind;
    default_keywords: string[];
    job_type_hint?: JobTypeHint;
    notes?: string;
    archived?: boolean;
};
export declare const newTrackInputSchema: z.ZodObject<{
    label: z.ZodString;
    id: z.ZodOptional<z.ZodString>;
    default_keywords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    job_type_hint: z.ZodOptional<z.ZodEnum<["permanent", "contract", "either"]>>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    label: string;
    id?: string | undefined;
    default_keywords?: string[] | undefined;
    job_type_hint?: "permanent" | "contract" | "either" | undefined;
    notes?: string | undefined;
}, {
    label: string;
    id?: string | undefined;
    default_keywords?: string[] | undefined;
    job_type_hint?: "permanent" | "contract" | "either" | undefined;
    notes?: string | undefined;
}>;
export type NewTrackInput = z.infer<typeof newTrackInputSchema>;
export declare function slugifyTrackLabel(label: string): string;
export declare function builtinTracks(): TrackDefinition[];
