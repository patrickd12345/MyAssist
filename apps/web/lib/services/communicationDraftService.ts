import type { GmailSignal, JobHuntNormalizedIdentity } from "@/lib/types";

export type CommunicationDraftType =
  | "follow_up"
  | "interview_accept"
  | "interview_reschedule"
  | "thank_you";

export type DraftLanguage = "en" | "fr";

export type BuildCommunicationDraftInput = {
  type: CommunicationDraftType;
  identity?: JobHuntNormalizedIdentity;
  signal?: GmailSignal;
  language?: DraftLanguage;
  interviewStartIso?: string | null;
};

export type CommunicationDraftResult = {
  subject: string;
  body: string;
  tone: "neutral";
  confidence: number;
  language: DraftLanguage;
};

function normalizeLang(language: DraftLanguage | undefined): DraftLanguage {
  return language === "fr" ? "fr" : "en";
}

function firstNameFromRecruiter(name: string | undefined): string {
  if (!name?.trim()) return "";
  const cleaned = name.replace(/".*?"/g, "").replace(/<.*?>/g, "").trim();
  const part = cleaned.split(/[\s,]+/)[0] ?? "";
  return part || "";
}

function roleLabel(identity: JobHuntNormalizedIdentity | undefined, lang: DraftLanguage): string {
  const r = identity?.role?.trim();
  if (r) return r;
  return lang === "fr" ? "l'opportunité" : "the opportunity";
}

function companyInSubject(identity: JobHuntNormalizedIdentity | undefined): string {
  return identity?.company?.trim() ?? "";
}

function roleInSubject(identity: JobHuntNormalizedIdentity | undefined, lang: DraftLanguage): string {
  const r = identity?.role?.trim();
  if (r) return r;
  return lang === "fr" ? "poste" : "role";
}

function greetingLine(identity: JobHuntNormalizedIdentity | undefined, lang: DraftLanguage): string {
  const fn = firstNameFromRecruiter(identity?.recruiterName);
  if (fn) {
    return lang === "fr" ? `Bonjour ${fn},` : `Hi ${fn},`;
  }
  return lang === "fr" ? "Bonjour," : "Hi,";
}

function closingLine(lang: DraftLanguage): { lead: string; signoff: string } {
  if (lang === "fr") {
    return { lead: "Cordialement,", signoff: "[Votre nom]" };
  }
  return { lead: "Best,", signoff: "[Your name]" };
}

function formatDateTimeHint(
  signal: GmailSignal | undefined,
  interviewStartIso: string | null | undefined,
  lang: DraftLanguage,
): string {
  if (interviewStartIso?.trim()) {
    const t = Date.parse(interviewStartIso);
    if (!Number.isNaN(t)) {
      try {
        return new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-CA", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(t));
      } catch {
        return interviewStartIso.trim();
      }
    }
  }
  if (signal?.date?.trim()) {
    const t = Date.parse(signal.date);
    if (!Number.isNaN(t)) {
      try {
        return new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-CA", {
          dateStyle: "medium",
        }).format(new Date(t));
      } catch {
        return signal.date.trim();
      }
    }
  }
  return lang === "fr" ? "la date proposée" : "the scheduled time";
}

function confidenceScore(identity: JobHuntNormalizedIdentity | undefined, hasDateHint: boolean): number {
  let score = 0.55;
  if (identity?.company?.trim()) score += 0.12;
  if (identity?.role?.trim()) score += 0.12;
  if (identity?.recruiterName?.trim()) score += 0.1;
  if (hasDateHint) score += 0.08;
  return Math.min(0.95, Math.round(score * 100) / 100);
}

function buildFollowUp(
  identity: JobHuntNormalizedIdentity | undefined,
  lang: DraftLanguage,
): CommunicationDraftResult {
  const role = roleLabel(identity, lang);
  const company = companyInSubject(identity);
  const { lead, signoff } = closingLine(lang);

  const subject =
    lang === "fr"
      ? company
        ? `Relance — ${roleInSubject(identity, lang)} chez ${company}`
        : `Relance — ${role}`
      : company
        ? `Following up — ${roleInSubject(identity, lang)} @ ${company}`
        : `Following up — ${role}`;

  const body =
    lang === "fr"
      ? `${greetingLine(identity, lang)}

Je me permets de faire un suivi concernant le poste de ${role}${company ? ` chez ${company}` : ""}.
Je reste disponible pour toute information complémentaire.

${lead}
${signoff}`
      : `${greetingLine(identity, lang)}

I wanted to follow up regarding the ${role}${company ? ` at ${company}` : ""}.
Happy to provide anything further if helpful.

${lead}
${signoff}`;

  return {
    subject,
    body: body.replace(/\n{3,}/g, "\n\n").trim(),
    tone: "neutral",
    confidence: confidenceScore(identity, false),
    language: lang,
  };
}

function buildInterviewAccept(
  identity: JobHuntNormalizedIdentity | undefined,
  signal: GmailSignal | undefined,
  interviewStartIso: string | null | undefined,
  lang: DraftLanguage,
): CommunicationDraftResult {
  const role = roleInSubject(identity, lang);
  const dt = formatDateTimeHint(signal, interviewStartIso, lang);
  const hasConcreteTime =
    Boolean(interviewStartIso?.trim()) &&
    !Number.isNaN(Date.parse(interviewStartIso!)) &&
    interviewStartIso!.includes("T");
  const { lead, signoff } = closingLine(lang);

  const subject =
    lang === "fr" ? `Confirmation d'entrevue — ${role}` : `Interview confirmation — ${role}`;

  const body = hasConcreteTime
    ? lang === "fr"
      ? `${greetingLine(identity, lang)}

Merci pour l'invitation.
Je confirme ma présence pour le ${dt}.
Au plaisir d'échanger avec vous.

${lead}
${signoff}`
      : `${greetingLine(identity, lang)}

Thanks for the invitation.
Confirmed for ${dt}.
Looking forward to speaking.

${lead}
${signoff}`
    : lang === "fr"
      ? `${greetingLine(identity, lang)}

Merci pour l'invitation.
Je confirme ma participation à l'entrevue (horaire à confirmer de votre côté).
Au plaisir d'échanger avec vous.

${lead}
${signoff}`
      : `${greetingLine(identity, lang)}

Thanks for the invitation.
I confirm I'll attend — please share the exact time if it is not yet finalized.
Looking forward to speaking.

${lead}
${signoff}`;

  return {
    subject,
    body: body.trim(),
    tone: "neutral",
    confidence: confidenceScore(identity, hasConcreteTime),
    language: lang,
  };
}

function buildInterviewReschedule(
  identity: JobHuntNormalizedIdentity | undefined,
  lang: DraftLanguage,
): CommunicationDraftResult {
  const role = roleInSubject(identity, lang);
  const { lead, signoff } = closingLine(lang);

  const subject =
    lang === "fr"
      ? `Demande de report d'entrevue — ${role}`
      : `Interview reschedule request — ${role}`;

  const body =
    lang === "fr"
      ? `${greetingLine(identity, lang)}

Serait-il possible de déplacer l'entrevue?
Je suis disponible à d'autres moments au besoin.
Merci pour votre flexibilité.

${lead}
${signoff}`
      : `${greetingLine(identity, lang)}

Would it be possible to move the interview?
I'm available at alternate times if needed.
Thanks for the flexibility.

${lead}
${signoff}`;

  return {
    subject,
    body: body.trim(),
    tone: "neutral",
    confidence: confidenceScore(identity, false),
    language: lang,
  };
}

function buildThankYou(
  identity: JobHuntNormalizedIdentity | undefined,
  lang: DraftLanguage,
): CommunicationDraftResult {
  const role = roleInSubject(identity, lang);
  const { lead, signoff } = closingLine(lang);

  const subject = lang === "fr" ? `Merci — ${role}` : `Thank you — ${role}`;

  const body =
    lang === "fr"
      ? `${greetingLine(identity, lang)}

Merci pour la conversation d'aujourd'hui.
J'ai beaucoup apprécié en apprendre davantage sur le rôle et l'équipe.

${lead}
${signoff}`
      : `${greetingLine(identity, lang)}

Thanks for the conversation today.
It was great learning more about the role and team.

${lead}
${signoff}`;

  return {
    subject,
    body: body.trim(),
    tone: "neutral",
    confidence: confidenceScore(identity, false),
    language: lang,
  };
}

/**
 * Deterministic email draft templates for job-hunt communication (no LLM). Does not send mail.
 */
export function buildCommunicationDraft(input: BuildCommunicationDraftInput): CommunicationDraftResult {
  const lang = normalizeLang(input.language);
  const identity = input.signal?.job_hunt_analysis?.normalizedIdentity ?? input.identity;

  switch (input.type) {
    case "follow_up":
      return buildFollowUp(identity, lang);
    case "interview_accept":
      return buildInterviewAccept(identity, input.signal, input.interviewStartIso, lang);
    case "interview_reschedule":
      return buildInterviewReschedule(identity, lang);
    case "thank_you":
      return buildThankYou(identity, lang);
    default:
      return buildFollowUp(identity, lang);
  }
}
