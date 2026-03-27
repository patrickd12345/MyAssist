import type { UnifiedJob } from "../types/job.js";

export type SearchFilters = {
  ai?: boolean;
  sap_bridge?: boolean;
  senior_only?: boolean;
};

const AI_TERMS =
  /\b(ai|ml|llm|genai|machine learning|deep learning|pytorch|tensorflow|nlp|agent|embedding|vector|rag)\b/i;
const SAP_TERMS = /\b(sap|s\/4hana|s4hana|abap|fico|bw\/4|btp|successfactors)\b/i;

export function applyDomainFilters(jobs: UnifiedJob[], filters: SearchFilters | undefined): UnifiedJob[] {
  if (!filters) return jobs;
  let out = jobs;
  if (filters.ai) {
    out = out.filter((j) => AI_TERMS.test(`${j.title} ${j.description} ${j.tags.join(" ")}`));
  }
  if (filters.sap_bridge) {
    out = out.filter((j) => SAP_TERMS.test(`${j.title} ${j.description} ${j.tags.join(" ")}`));
  }
  if (filters.senior_only) {
    out = out.filter((j) => /\b(senior|staff|principal|lead|director)\b/i.test(j.title));
  }
  return out;
}

export function applyQueryFilters(
  jobs: UnifiedJob[],
  opts: {
    remote?: boolean;
    job_type?: "permanent" | "contract" | "either";
  },
): UnifiedJob[] {
  let out = jobs;
  if (opts.remote === true) {
    out = out.filter((j) => j.remote);
  }
  if (opts.job_type === "permanent") {
    out = out.filter((j) => j.type === "permanent" || j.type === "unknown");
  }
  if (opts.job_type === "contract") {
    out = out.filter((j) => j.type === "contract" || j.type === "unknown");
  }
  return out;
}
