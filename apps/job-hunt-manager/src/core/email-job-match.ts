import type { UnifiedJob } from "../types/job.js";
import type { EmailSignalInput } from "../types/lifecycle.js";

const AGGREGATOR_HOSTS = new Set([
  "linkedin.com",
  "www.linkedin.com",
  "ca.linkedin.com",
  "indeed.com",
  "www.indeed.com",
  "ca.indeed.com",
  "glassdoor.com",
  "www.glassdoor.com",
  "workopolis.com",
  "www.workopolis.com",
  "monster.com",
  "www.monster.com",
  "ziprecruiter.com",
  "www.ziprecruiter.com",
  "loopcv.io",
  "www.loopcv.io",
]);

const RECRUITMENT_RE =
  /\b(application|applied|interview|requisition|position|role|hiring|recruit|candidate|assessment|screening|schedule|calendar|calendly|offer|compensation|feedback|status|update|next steps|phone screen|video call|zoom|teams meeting)\b/i;

const REJECTION_RE =
  /\b(reject|unfortunately|not selected|not moving forward|no longer under consideration|other candidates|position has been filled|decided to move forward with)\b/i;

const OFFER_RE = /\b(offer of employment|formal offer|compensation package|signing bonus|start date|pleased to offer)\b/i;

const INTERVIEW_RE =
  /\b(interview invitation|schedule (?:an |your )?interview|book (?:a |your )?(?:time|slot)|interview (?:with|at)|next round)\b/i;

export type EmailJobMatchReason =
  | "sender_domain"
  | "company_and_recruitment"
  | "subject_job_id";

/** User-visible token for email subjects and calendar titles: `[MA-JOB:<canonical_job_id>]`. */
export const MYASSIST_JOB_ID_BRACKET_PREFIX = "[MA-JOB:";

/**
 * Extract canonical job id from a `[MA-JOB:...]` tag in subject or body (case-insensitive on the tag).
 * Id is everything between the colon and the closing `]` (supports ids with colons, e.g. `linkedin:https:...`).
 */
export function extractJobIdFromMyAssistTag(text: string): string | null {
  const m = text.match(/\[MA-JOB:([^\]]+)\]/i);
  const id = m?.[1]?.trim();
  return id || null;
}

export type EmailToJobMatch = {
  score: number;
  reason: EmailJobMatchReason;
};

export function extractEmailDomain(from: string): string | null {
  const angle = from.match(/<([^>]+)>/);
  const raw = (angle ? angle[1] : from).trim();
  const at = raw.lastIndexOf("@");
  if (at === -1) return null;
  return raw.slice(at + 1).toLowerCase().replace(/^mailto:/i, "");
}

export function hostnameFromJobUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isAggregatorHost(host: string): boolean {
  return AGGREGATOR_HOSTS.has(host) || host.endsWith(".linkedin.com") || host.endsWith(".indeed.com");
}

function companyTokens(company: string): string[] {
  return company
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);
}

function combinedSignalText(signal: EmailSignalInput): string {
  return `${signal.subject}\n${signal.snippet}\n${signal.from}`.toLowerCase();
}

function companyMentioned(text: string, company: string): boolean {
  const tokens = companyTokens(company);
  if (tokens.length === 0) return false;
  const hits = tokens.filter((t) => text.includes(t));
  if (tokens.length === 1) return hits.length >= 1;
  return hits.length >= Math.min(2, tokens.length);
}

/**
 * Heuristic match: recruiter domain vs job posting host (non-aggregators), or company name + recruitment cues.
 */
export function matchEmailToJob(signal: EmailSignalInput, job: UnifiedJob): EmailToJobMatch | null {
  const emailDomain = extractEmailDomain(signal.from);
  const jobHost = hostnameFromJobUrl(job.url);
  const text = combinedSignalText(signal);

  if (emailDomain && jobHost && !isAggregatorHost(jobHost)) {
    if (emailDomain === jobHost || emailDomain.endsWith(`.${jobHost}`) || jobHost.endsWith(`.${emailDomain}`)) {
      return { score: 95, reason: "sender_domain" };
    }
    const companySlug = companyTokens(job.company).join("");
    if (companySlug.length > 3 && emailDomain.split(".")[0]?.includes(companySlug.slice(0, 8))) {
      return { score: 75, reason: "sender_domain" };
    }
  }

  if (companyMentioned(text, job.company) && RECRUITMENT_RE.test(text)) {
    return { score: 72, reason: "company_and_recruitment" };
  }

  return null;
}

export function signalFingerprint(signal: EmailSignalInput): string {
  const key = [signal.threadId ?? "", signal.id ?? "", signal.date ?? "", signal.subject ?? ""].join("|");
  return key.slice(0, 240);
}

export function inferStageFromEmailText(
  subject: string,
  snippet: string,
): import("../types/lifecycle.js").LifecycleStage | null {
  const t = `${subject}\n${snippet}`.toLowerCase();
  if (REJECTION_RE.test(t)) return "closed_lost";
  if (OFFER_RE.test(t)) return "offer";
  if (INTERVIEW_RE.test(t) || /\binterview\b.*\b(schedule|invite|book)\b/.test(t)) return "interview_scheduled";
  if (/\b(take[- ]?home|coding challenge|assessment|hackerrank|codility)\b/.test(t)) return "waiting_call";
  return null;
}

const STAGE_RANK: Record<string, number> = {
  lead: 0,
  applied: 1,
  waiting_call: 2,
  interview_scheduled: 3,
  interviewed: 4,
  offer: 5,
  closed_won: 6,
  closed_lost: 6,
};

export function shouldAdvanceStage(
  current: import("../types/lifecycle.js").LifecycleStage,
  inferred: import("../types/lifecycle.js").LifecycleStage,
): boolean {
  if (inferred === "closed_lost") return current !== "closed_won" && current !== "closed_lost";
  if (inferred === "closed_won") return current !== "closed_lost";
  return STAGE_RANK[inferred] > STAGE_RANK[current];
}
