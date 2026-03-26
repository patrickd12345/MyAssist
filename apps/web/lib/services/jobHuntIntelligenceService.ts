import type {
  GmailSignal,
  JobHuntAction,
  JobHuntAnalysis,
  JobHuntSignal,
  MyAssistDailyContext,
} from "@/lib/types";

const JOB_CONTEXT_RE =
  /\b(job|role|position|career|recruit|hiring|interview|application|resume|cv|candidate|offer|requisition|req\.?\s*\d+|greenhouse|lever|workday|icims|taleo|bamboohr|ashby|linkedin)\b/i;

const RECRUITING_FROM_RE =
  /@(?:.*\.)?(?:greenhouse|lever|workday|icims|ashbyhq|jobs\.|careers\.)/i;

function combinedText(signal: Pick<GmailSignal, "from" | "subject" | "snippet">): string {
  return `${signal.from}\n${signal.subject}\n${signal.snippet}`.toLowerCase();
}

function hasJobContext(text: string): boolean {
  return JOB_CONTEXT_RE.test(text) || RECRUITING_FROM_RE.test(text);
}

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
    re: /\b(?:application\s+(?:received|confirmed)|thank\s+you\s+for\s+applying|we\s+received\s+your\s+application|your\s+application\s+has\s+been\s+received)\b/i,
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

function confidenceFromHits(rawScore: number, signalCount: number, jobBoost: boolean): number {
  let c = Math.min(0.95, rawScore + (jobBoost ? 0.12 : 0));
  if (signalCount > 1) c = Math.min(0.95, c + 0.06);
  return Math.round(c * 100) / 100;
}

/**
 * Lightweight heuristic analysis of a single Gmail signal (subject/snippet/from only).
 * Conservative: returns empty signals when the text does not look job-related.
 */
export function analyzeEmail(signal: Pick<GmailSignal, "from" | "subject" | "snippet">): JobHuntAnalysis {
  const text = combinedText(signal);
  if (text.trim().length < 12) {
    return { signals: [], confidence: 0, suggestedActions: [] };
  }

  const jobOk = hasJobContext(text);
  const hits: { signal: JobHuntSignal; weight: number }[] = [];

  for (const rule of RULES) {
    if (rule.re.test(text)) {
      hits.push({ signal: rule.signal, weight: rule.weight });
    }
  }

  if (hits.length === 0) {
    return { signals: [], confidence: 0, suggestedActions: [] };
  }

  const strongInterview =
    hits.some((h) => h.signal === "interview_request" || h.signal === "technical_interview") &&
    (jobOk || /\binterview\b/i.test(text));

  const strongFollowUp =
    hits.some((h) => h.signal === "follow_up") && (jobOk || /\b(?:role|position|application|recruit)\b/i.test(text));

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

  if (filtered.length === 0) {
    return { signals: [], confidence: 0, suggestedActions: [] };
  }

  const signalList = uniqueSignals(filtered.map((h) => h.signal));
  const rawScore = filtered.reduce((sum, h) => sum + h.weight, 0) / Math.max(1, filtered.length);
  const confidence = confidenceFromHits(rawScore, signalList.length, jobOk);

  if (confidence < 0.35) {
    return { signals: [], confidence: 0, suggestedActions: [] };
  }

  return {
    signals: signalList,
    confidence,
    suggestedActions: suggestedActionsFor(signalList),
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
