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

export type NewTrackInput = z.infer<typeof newTrackInputSchema>;

export function slugifyTrackLabel(label: string): string {
  const s = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return s.length > 0 ? s : "track";
}

export function builtinTracks(): TrackDefinition[] {
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
