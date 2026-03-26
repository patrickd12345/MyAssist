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
export const jobTypeSchema = z.enum(["permanent", "contract", "unknown"]);
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
