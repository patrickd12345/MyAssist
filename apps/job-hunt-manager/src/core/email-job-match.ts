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
  | "subject_job_id"
  | "normalized_identity";

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

export type MatchTieBreakInput = {
  threadIdExact: boolean;
  roleOverlap: number;
  subjectOverlap: number;
  jobId: string;
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

/** Strip Re:/Fwd: and noise for cross-email subject similarity. */
export function normalizeSubjectForLinking(subject: string): string {
  return subject
    .replace(/^\s*(re|fwd|fw)\s*:\s*/gi, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeForOverlap(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);
}

function titleRoleOverlap(role: string | undefined, jobTitle: string): number {
  if (!role?.trim()) return 0;
  const rs = new Set(tokenizeForOverlap(role));
  const jt = tokenizeForOverlap(jobTitle);
  let n = 0;
  for (const t of jt) {
    if (rs.has(t)) n += 1;
  }
  return n;
}

export function roleTokenOverlapForJob(signal: EmailSignalInput, job: UnifiedJob): number {
  return titleRoleOverlap(signal.normalizedIdentity?.role, job.title);
}

function identityCompanyAligned(niCompany: string | undefined, jobCompany: string): boolean {
  if (!niCompany?.trim()) return false;
  const a = companyTokens(niCompany);
  const b = new Set(companyTokens(jobCompany));
  if (a.length === 0 || b.size === 0) return false;
  const hits = a.filter((t) => b.has(t));
  return hits.length >= Math.min(2, Math.min(a.length, b.size)) || (hits.length >= 1 && a.length === 1);
}

function subjectTitleTokenOverlap(subject: string, jobTitle: string): number {
  const st = new Set(tokenizeForOverlap(normalizeSubjectForLinking(subject)));
  const tt = tokenizeForOverlap(jobTitle);
  let n = 0;
  for (const t of tt) {
    if (st.has(t)) n += 1;
  }
  return n;
}

export function subjectTokenOverlapForJob(signal: EmailSignalInput, job: UnifiedJob): number {
  return subjectTitleTokenOverlap(signal.subject, job.title);
}

export function compareMatchTieBreak(a: MatchTieBreakInput, b: MatchTieBreakInput): number {
  if (a.threadIdExact !== b.threadIdExact) return a.threadIdExact ? 1 : -1;
  if (a.roleOverlap !== b.roleOverlap) return a.roleOverlap > b.roleOverlap ? 1 : -1;
  if (a.subjectOverlap !== b.subjectOverlap) return a.subjectOverlap > b.subjectOverlap ? 1 : -1;
  if (a.jobId === b.jobId) return 0;
  return a.jobId < b.jobId ? 1 : -1;
}

function identityBoost(signal: EmailSignalInput, job: UnifiedJob, text: string): number {
  const ni = signal.normalizedIdentity;
  if (!ni) return 0;
  let boost = 0;
  if (identityCompanyAligned(ni.company, job.company) && RECRUITMENT_RE.test(text)) {
    boost += 12;
  }
  const ro = titleRoleOverlap(ni.role, job.title);
  if (ro >= 2) boost += 10;
  else if (ro === 1) boost += 5;
  const subjOverlap = subjectTitleTokenOverlap(signal.subject, job.title);
  if (subjOverlap >= 2) boost += 8;
  else if (subjOverlap === 1) boost += 3;
  if (ni.recruiterName?.trim() && signal.from.toLowerCase().includes(ni.recruiterName.split(/\s+/)[0]?.toLowerCase() ?? "")) {
    boost += 4;
  }
  return Math.min(22, boost);
}

function matchFromNormalizedIdentity(signal: EmailSignalInput, job: UnifiedJob, text: string): EmailToJobMatch | null {
  const ni = signal.normalizedIdentity;
  if (!ni) return null;
  const companyOk = identityCompanyAligned(ni.company, job.company) || companyMentioned(text, job.company);
  const ro = titleRoleOverlap(ni.role, job.title);
  const subjOverlap = subjectTitleTokenOverlap(signal.subject, job.title);
  if (!companyOk) return null;
  if (!RECRUITMENT_RE.test(text) && ro < 1 && subjOverlap < 1) return null;
  let score = 66;
  if (identityCompanyAligned(ni.company, job.company)) score += 8;
  if (ro >= 2) score += 8;
  else if (ro === 1) score += 4;
  if (subjOverlap >= 2) score += 6;
  return { score: Math.min(90, score), reason: "normalized_identity" };
}

/**
 * Heuristic match: recruiter domain vs job posting host (non-aggregators), or company name + recruitment cues.
 */
export function matchEmailToJob(signal: EmailSignalInput, job: UnifiedJob): EmailToJobMatch | null {
  const emailDomain = extractEmailDomain(signal.from);
  const jobHost = hostnameFromJobUrl(job.url);
  const text = combinedSignalText(signal);

  let base: EmailToJobMatch | null = null;

  if (emailDomain && jobHost && !isAggregatorHost(jobHost)) {
    if (emailDomain === jobHost || emailDomain.endsWith(`.${jobHost}`) || jobHost.endsWith(`.${emailDomain}`)) {
      base = { score: 95, reason: "sender_domain" };
    } else {
      const companySlug = companyTokens(job.company).join("");
      if (companySlug.length > 3 && emailDomain.split(".")[0]?.includes(companySlug.slice(0, 8))) {
        base = { score: 75, reason: "sender_domain" };
      }
    }
  }

  if (!base && companyMentioned(text, job.company) && RECRUITMENT_RE.test(text)) {
    base = { score: 72, reason: "company_and_recruitment" };
  }

  const boost = identityBoost(signal, job, text);
  if (base && boost > 0) {
    return { score: Math.min(100, base.score + boost), reason: base.reason };
  }
  if (base) {
    return base;
  }

  return matchFromNormalizedIdentity(signal, job, text);
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
