import type { GmailMessage } from "@/lib/adapters/gmailAdapter";
import type { JobHuntAnalysis } from "@/lib/types";

function stripSubjectNoise(subject: string): string {
  return subject.replace(/^\s*(re|fwd)\s*:\s*/gi, "").replace(/\s+/g, " ").trim();
}

function fallbackTitleFromSubject(subject: string): string {
  const collapsed = stripSubjectNoise(subject);
  if (!collapsed) return "(no subject email)";
  return collapsed.length > 120 ? `${collapsed.slice(0, 117)}...` : collapsed;
}

/**
 * Short Todoist task title for email→task follow-ups.
 * Prefers normalized company/role/recruiter when job analysis supports it.
 */
export function buildFollowUpTaskContent(email: GmailMessage, analysis: JobHuntAnalysis): string {
  const signals = analysis.signals ?? [];
  const jobLike =
    signals.length > 0 &&
    (signals.some((s) => s === "follow_up" || s === "interview_request" || s === "technical_interview") ||
      signals.includes("application_confirmation"));

  const ni = analysis.normalizedIdentity;
  const company = ni?.company?.trim();
  const role = ni?.role?.trim();
  const recruiter = ni?.recruiterName?.trim();

  if (jobLike && company && role) {
    return `Follow up: ${role} @ ${company}`;
  }
  if (jobLike && company && recruiter) {
    return `Follow up: ${recruiter} (${company})`;
  }
  if (jobLike && company) {
    return `Follow up: ${company}`;
  }
  if (jobLike && recruiter) {
    return `Follow up: ${recruiter}`;
  }

  return fallbackTitleFromSubject(email.subject);
}

/**
 * Task description: minimal context, snippet, Gmail link — no generic filler lines.
 */
export function buildFollowUpTaskDescription(email: GmailMessage, analysis: JobHuntAnalysis): string {
  const ni = analysis.normalizedIdentity;
  const lines: string[] = [];

  if (ni?.company && ni.role) {
    lines.push(`${ni.role} · ${ni.company}`);
  } else if (ni?.company) {
    lines.push(ni.company);
  } else if (ni?.role) {
    lines.push(ni.role);
  }

  if (ni?.recruiterName) {
    lines.push(`From: ${ni.recruiterName}`);
  } else if (email.from) {
    const shortFrom = email.from.replace(/\s+/g, " ").trim().slice(0, 120);
    if (shortFrom) lines.push(`From: ${shortFrom}`);
  }

  const snippet = email.snippet.replace(/\s+/g, " ").trim();
  if (snippet) {
    lines.push(snippet.length > 280 ? `${snippet.slice(0, 277)}...` : snippet);
  }

  if (email.threadId) {
    lines.push(
      "",
      `Gmail: https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(email.threadId)}`,
    );
  } else if (email.id) {
    lines.push("", `Message id: ${email.id}`);
  }

  return lines.filter(Boolean).join("\n");
}
