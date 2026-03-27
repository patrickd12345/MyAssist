import type {
  GmailSignal,
  JobHuntAction,
  JobHuntAnalysis,
  JobHuntManagerStageHint,
  JobHuntNormalizedIdentity,
  JobHuntSignal,
  JobHuntStageAlias,
  MyAssistDailyContext,
} from "@/lib/types";

const JOB_CONTEXT_RE =
  /\b(job|role|position|career|recruit|hiring|interview|application|resume|cv|candidate|offer|requisition|req\.?\s*\d+|greenhouse|lever|workday|icims|taleo|bamboohr|ashby|linkedin)\b/i;

const RECRUITING_FROM_RE =
  /@(?:.*\.)?(?:greenhouse|lever|workday|icims|ashbyhq|jobs\.|careers\.)/i;
const RECRUITER_DOMAIN_RE = /@(?:.*\.)?(?:talent|jobs|careers|recruiting|recruiter|hr)\./i;
const OUTREACH_RE =
  /\b(?:came\s+across\s+your\s+profile|we(?:')?re\s+hiring|open\s+role|reach(?:ing)?\s+out\s+regarding|interested\s+in\s+this\s+opportunity)\b/i;

function combinedText(signal: Pick<GmailSignal, "from" | "subject" | "snippet">): string {
  return `${signal.from}\n${signal.subject}\n${signal.snippet}`.toLowerCase();
}

function hasJobContext(text: string): boolean {
  return JOB_CONTEXT_RE.test(text) || RECRUITING_FROM_RE.test(text);
}

const COMPANY_HINT_RE =
  /\b(?:at|with|from)\s+([A-Z][a-zA-Z0-9&.,' -]{1,60}?)(?:\s+(?:for|about|on)\b|[.,;]|$)/;

const ROLE_HINT_RE =
  /\b(?:for|about|regarding|position(?:\s+of)?|role(?:\s+of)?)\s+(?:the\s+)?([A-Za-z][a-zA-Z0-9/+& -]{2,80}?(?:engineer|developer|manager|analyst|designer|consultant|specialist|administrator|architect|coordinator|lead|intern|director|officer|scientist))\b/i;

type Rule = { re: RegExp; signal: JobHuntSignal; weight: number };

const RULES: Rule[] = [
  {
    re: /\b(?:not\s+(?:selected|shortlisted)|regret(?:s)?\s+to\s+inform|unable\s+to\s+proceed|will\s+not\s+be\s+(?:moving|proceeding)|position\s+(?:has\s+been\s+)?filled|no\s+longer\s+under\s+consideration)\b/i,
    signal: "rejection",
    weight: 0.42,
  },
  {
    re: /\b(?:pleased\s+to\s+offer|formal\s+offer|compensation\s+package|offer\s+letter|extend(?:ing)?\s+(?:an\s+)?offer)\b/i,
    signal: "offer",
    weight: 0.42,
  },
  {
    re: /\b(?:technical\s+interview|coding\s+(?:challenge|interview)|system\s+design|onsite\s+interview)\b/i,
    signal: "technical_interview",
    weight: 0.4,
  },
  {
    re: /\b(?:schedule\s+(?:an?\s+)?interview|book\s+(?:a\s+)?(?:time|slot)|available\s+(?:at|between|on)|screening\s+call|phone\s+screen|zoom\s+(?:for|interview|meeting)|video\s+interview)\b/i,
    signal: "interview_request",
    weight: 0.38,
  },
  {
    re: /\b(?:let'?s\s+meet|meet\s+(?:with|at)|interview\s+(?:invite|invitation))\b/i,
    signal: "interview_request",
    weight: 0.36,
  },
  {
    re: /\b(?:following\s+up|follow(?:\s*[-–])?up|check(?:ing)?\s+in|circling\s+back|touching\s+base|next\s+steps)\b/i,
    signal: "follow_up",
    weight: 0.34,
  },
  {
    re: OUTREACH_RE,
    signal: "follow_up",
    weight: 0.34,
  },
  {
    re: /\b(?:application\s+(?:received|confirmed|submitted)|thank(?:s| you)\s+for\s+applying|we\s+received\s+your\s+application|your\s+application\s+has\s+been\s+received|we(?:')?ll\s+review\s+your\s+application)\b/i,
    signal: "application_confirmation",
    weight: 0.38,
  },
];

function uniqueSignals(hits: JobHuntSignal[]): JobHuntSignal[] {
  const order: JobHuntSignal[] = [
    "rejection",
    "offer",
    "technical_interview",
    "interview_request",
    "follow_up",
    "application_confirmation",
  ];
  const set = new Set(hits);
  return order.filter((s) => set.has(s));
}

function suggestedActionsFor(signals: JobHuntSignal[]): JobHuntAction[] {
  const actions = new Set<JobHuntAction>();
  if (signals.includes("rejection") || signals.includes("offer")) {
    actions.add("update_pipeline");
  }
  if (signals.includes("application_confirmation")) {
    actions.add("update_pipeline");
  }
  if (signals.includes("follow_up")) {
    actions.add("create_followup_task");
  }
  if (signals.includes("interview_request") || signals.includes("technical_interview")) {
    actions.add("create_prep_task");
    actions.add("suggest_calendar_block");
    actions.add("create_interview_event");
  }
  const order: JobHuntAction[] = [
    "create_prep_task",
    "create_followup_task",
    "suggest_calendar_block",
    "create_interview_event",
    "update_pipeline",
  ];
  return order.filter((a) => actions.has(a));
}

const SIGNAL_STAGE_PRIORITY: JobHuntSignal[] = [
  "rejection",
  "offer",
  "technical_interview",
  "interview_request",
  "application_confirmation",
];

export function stageAliasForSignals(signals: JobHuntSignal[]): JobHuntStageAlias | undefined {
  for (const signal of SIGNAL_STAGE_PRIORITY) {
    if (!signals.includes(signal)) continue;
    if (signal === "rejection") return "rejected";
    if (signal === "offer") return "offer";
    if (signal === "technical_interview") return "technical";
    if (signal === "interview_request") return "interview";
    if (signal === "application_confirmation") return "applied";
  }
  return undefined;
}

export function managerStageHintForAlias(alias: JobHuntStageAlias | undefined): JobHuntManagerStageHint | undefined {
  if (!alias) return undefined;
  if (alias === "applied") return "applied";
  if (alias === "interview") return "interview_scheduled";
  if (alias === "technical") return "waiting_call";
  if (alias === "offer") return "offer";
  return "closed_lost";
}

function cleanIdentityValue(value: string | undefined): string | undefined {
  const v = (value ?? "").replace(/\s+/g, " ").trim();
  return v || undefined;
}

function stripTrailingIdentityClauses(value: string): string {
  return value
    .replace(/\b(?:is|was|were|will\s+be)\s+(?:confirmed|scheduled|booked|set|arranged)\b.*$/i, "")
    .replace(/\b(?:for|about|on)\s+(?:the\s+)?(?:role|position)\b.*$/i, "")
    .trim();
}

/** Job title tail used for bounded extraction after stripping application / screening phrases. */
const TITLE_TAIL_RE =
  /[A-Za-z][a-zA-Z0-9/+& -]{0,72}?(?:engineer|developer|manager|analyst|designer|consultant|specialist|administrator|architect|coordinator|lead|intern|director|officer|scientist)\b/i;

function looksLikeSentenceFragmentRole(value: string): boolean {
  const v = value.trim();
  if (v.length > 90) return true;
  if (/\b(?:applying|apply)\s+to\b/i.test(v)) return true;
  if (/\b(?:we|you|they|i)\s+(?:would|will|'d|have)\b/i.test(v)) return true;
  return false;
}

function sanitizeRoleValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let cleaned = stripTrailingIdentityClauses(value)
    .replace(/^(?:a|an|the)\s+(?:screening\s+)?call\s+for\s+(?:the\s+)?/i, "")
    .replace(/^(?:a|an|the)\s+(?:screening\s+call|interview)\s+for\s+/i, "")
    .replace(/^applying\s+to\s+(?:the\s+)?/i, "")
    .replace(/^apply\s+to\s+(?:the\s+)?/i, "")
    .replace(/^the\s+/i, "")
    .replace(/\s+role(?:\s+at\b|\s+for\b)?[\s\S]*$/i, "")
    .replace(/\b(?:role|position)\b$/i, "")
    .trim();

  const titlePick = cleaned.match(TITLE_TAIL_RE);
  if (titlePick && looksLikeSentenceFragmentRole(cleaned)) {
    cleaned = titlePick[0].trim();
  } else if (looksLikeSentenceFragmentRole(cleaned)) {
    return undefined;
  }

  return cleanIdentityValue(cleaned);
}

function sanitizeCompanyValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return cleanIdentityValue(stripTrailingIdentityClauses(value));
}

function companyFromDomain(from: string): string | undefined {
  const emailMatch = from.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (!emailMatch?.[1]) return undefined;
  const domain = emailMatch[1].toLowerCase();
  const parts = domain.split(".").filter(Boolean);
  if (parts.length < 2) return undefined;
  const labels = parts.slice(0, -1);
  const generic = new Set(["gmail", "outlook", "hotmail", "yahoo", "icloud", "talent", "jobs", "careers", "recruiting"]);
  const selected = labels.find((label) => !generic.has(label)) ?? labels[labels.length - 1];
  if (!selected || generic.has(selected)) return undefined;
  return selected
    .split(/[-_]/)
    .map((p) => (p ? `${p[0]?.toUpperCase() ?? ""}${p.slice(1)}` : ""))
    .join(" ")
    .trim();
}

const APPLYING_TO_TITLE_RE =
  /\bapplying\s+to\s+(?:the\s+)?([A-Za-z][a-zA-Z0-9/+& -]{0,72}?(?:engineer|developer|manager|analyst|designer|consultant|specialist|administrator|architect|coordinator|lead|intern|director|officer|scientist))\b/i;

export function extractJobIdentity(signal: Pick<GmailSignal, "id" | "threadId" | "from" | "subject" | "snippet">): JobHuntNormalizedIdentity {
  const from = signal.from ?? "";
  const subject = signal.subject ?? "";
  const snippet = signal.snippet ?? "";
  const combined = `${subject}\n${snippet}`;
  const fromName = from.replace(/<[^>]*>/g, "").replace(/["]/g, "").trim();
  const recruiterName = fromName && !fromName.includes("@") ? fromName : undefined;
  const companyFromFrom = companyFromDomain(from);
  const companyFromText = combined.match(COMPANY_HINT_RE)?.[1];
  let roleFromText = combined.match(ROLE_HINT_RE)?.[1];
  const applyingTitle = combined.match(APPLYING_TO_TITLE_RE)?.[1];
  if (applyingTitle) {
    roleFromText = applyingTitle;
  }
  return {
    company: sanitizeCompanyValue(companyFromText) ?? sanitizeCompanyValue(companyFromFrom),
    role: sanitizeRoleValue(roleFromText),
    recruiterName: cleanIdentityValue(recruiterName),
    threadId: cleanIdentityValue(signal.threadId ?? undefined),
    messageId: cleanIdentityValue(signal.id ?? undefined),
  };
}

function confidenceFromHits(rawScore: number, signalCount: number, jobBoost: boolean): number {
  let c = Math.min(0.95, rawScore + (jobBoost ? 0.12 : 0));
  if (signalCount > 1) c = Math.min(0.95, c + 0.06);
  return Math.round(c * 100) / 100;
}

/** When technical_interview matches, drop interview_request hits to avoid duplicate interview-family signals. */
function dropInterviewRequestWhenTechnicalPresent(
  hits: { signal: JobHuntSignal; weight: number }[],
): { signal: JobHuntSignal; weight: number }[] {
  if (!hits.some((h) => h.signal === "technical_interview") || !hits.some((h) => h.signal === "interview_request")) {
    return hits;
  }
  return hits.filter((h) => h.signal !== "interview_request");
}

function identityWithSuppressedFields(
  identity: JobHuntNormalizedIdentity,
): Pick<JobHuntNormalizedIdentity, "threadId" | "messageId"> {
  return {
    threadId: identity.threadId,
    messageId: identity.messageId,
  };
}

/**
 * Lightweight heuristic analysis of a single Gmail signal (subject/snippet/from only).
 * Conservative: returns empty signals when the text does not look job-related.
 */
export function analyzeEmail(signal: Pick<GmailSignal, "id" | "threadId" | "from" | "subject" | "snippet">): JobHuntAnalysis {
  const text = combinedText(signal);
  const identityFull = extractJobIdentity(signal);
  const emptyIdentity = (): JobHuntNormalizedIdentity => ({
    ...identityWithSuppressedFields(identityFull),
  });

  if (text.trim().length < 12) {
    return { signals: [], confidence: 0, suggestedActions: [], normalizedIdentity: emptyIdentity() };
  }

  const jobOk = hasJobContext(text);
  const hits: { signal: JobHuntSignal; weight: number }[] = [];

  for (const rule of RULES) {
    if (rule.re.test(text)) {
      hits.push({ signal: rule.signal, weight: rule.weight });
    }
  }

  if (hits.length === 0) {
    return { signals: [], confidence: 0, suggestedActions: [], normalizedIdentity: emptyIdentity() };
  }

  const strongInterview =
    hits.some((h) => h.signal === "interview_request" || h.signal === "technical_interview") &&
    (jobOk || /\binterview\b/i.test(text));

  const strongFollowUp =
    hits.some((h) => h.signal === "follow_up") &&
    (jobOk || /\b(?:role|position|application|recruit)\b/i.test(text) || (OUTREACH_RE.test(text) && RECRUITER_DOMAIN_RE.test(text)));

  const strongAppConfirm =
    hits.some((h) => h.signal === "application_confirmation") && (jobOk || /\bapplication\b/i.test(text));

  let filtered = [...hits];
  if (hits.some((h) => h.signal === "follow_up") && !strongFollowUp) {
    filtered = filtered.filter((h) => h.signal !== "follow_up");
  }
  if (hits.some((h) => h.signal === "application_confirmation") && !strongAppConfirm) {
    filtered = filtered.filter((h) => h.signal !== "application_confirmation");
  }
  if (
    hits.some((h) => h.signal === "interview_request" || h.signal === "technical_interview") &&
    !strongInterview &&
    !jobOk
  ) {
    filtered = filtered.filter(
      (h) => h.signal !== "interview_request" && h.signal !== "technical_interview",
    );
  }

  filtered = dropInterviewRequestWhenTechnicalPresent(filtered);

  if (filtered.length === 0) {
    return { signals: [], confidence: 0, suggestedActions: [], normalizedIdentity: emptyIdentity() };
  }

  const signalList = uniqueSignals(filtered.map((h) => h.signal));
  const rawScore = filtered.reduce((sum, h) => sum + h.weight, 0) / Math.max(1, filtered.length);
  const confidence = confidenceFromHits(rawScore, signalList.length, jobOk);

  if (confidence < 0.35) {
    return { signals: [], confidence: 0, suggestedActions: [], normalizedIdentity: emptyIdentity() };
  }
  const stageAlias = stageAliasForSignals(signalList);

  return {
    signals: signalList,
    confidence,
    suggestedActions: suggestedActionsFor(signalList),
    stageAlias,
    stageHintManager: managerStageHintForAlias(stageAlias),
    normalizedIdentity: identityFull,
  };
}

export function analyzeEmails(signals: GmailSignal[]): JobHuntAnalysis[] {
  return signals.map((s) => analyzeEmail(s));
}

export function enrichGmailSignalsWithJobHuntAnalysis(context: MyAssistDailyContext): MyAssistDailyContext {
  return {
    ...context,
    gmail_signals: context.gmail_signals.map((g) => {
      const job_hunt_analysis = analyzeEmail(g);
      if (job_hunt_analysis.signals.length === 0) {
        return g;
      }
      return { ...g, job_hunt_analysis };
    }),
  };
}
