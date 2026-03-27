import { z } from "zod";
export const newTrackInputSchema = z.object({
    label: z.string().min(1),
    id: z
        .string()
        .regex(/^[a-z0-9_]+$/)
        .optional(),
    default_keywords: z.array(z.string()).optional(),
    job_type_hint: z.enum(["permanent", "contract", "either"]).optional(),
    notes: z.string().optional(),
});
export function slugifyTrackLabel(label) {
    const s = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 48);
    return s.length > 0 ? s : "track";
}
export function builtinTracks() {
    return [
        {
            id: "ai_focus",
            label: "AI focus",
            kind: "builtin",
            default_keywords: [
                "artificial intelligence",
                "machine learning",
                "GenAI",
                "LLM",
                "MLOps",
                "data science",
                "AI engineer",
            ],
            job_type_hint: "either",
        },
        {
            id: "sap_bridge",
            label: "SAP contract (bridge to AI)",
            kind: "builtin",
            default_keywords: [
                "SAP",
                "S/4HANA",
                "ABAP",
                "FICO",
                "FI/CO",
                "Basis",
                "BW",
                "BTP",
            ],
            job_type_hint: "contract",
            notes: "Bridge narrative stored per posting as bridge_pitch",
        },
    ];
}
