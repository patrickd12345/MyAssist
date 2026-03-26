import { z } from "zod";

export const jobSourceSchema = z.enum([
  "linkedin",
  "indeed",
  "workopolis",
  "company",
  "loopcv",
  "rss",
  "unknown",
]);

export type JobSource = z.infer<typeof jobSourceSchema>;

export const jobTypeSchema = z.enum(["permanent", "contract", "unknown"]);

export type JobType = z.infer<typeof jobTypeSchema>;

export const unifiedJobSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  remote: z.boolean(),
  type: jobTypeSchema,
  source: jobSourceSchema,
  url: z.string(),
  posted_date: z.string().nullable(),
  salary: z.string().nullable(),
  description: z.string(),
  tags: z.array(z.string()),
  track: z.string().optional(),
});

export type UnifiedJob = z.infer<typeof unifiedJobSchema> & {
  _fetched_at?: string;
  _score?: number;
  _fingerprint?: string;
  _track_guess?: string;
  _track_confidence?: number;
  _raw_source?: string;
};

export type RawJob = {
  title: string;
  company: string;
  location: string;
  remote: boolean;
  type: JobType;
  source: JobSource;
  url: string;
  posted_date: string | null;
  salary: string | null;
  description: string;
  tags: string[];
};
