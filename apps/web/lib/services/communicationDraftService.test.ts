import { describe, expect, it } from "vitest";
import type { GmailSignal, JobHuntNormalizedIdentity } from "@/lib/types";
import type { DraftLanguage } from "./communicationDraftService";
import { buildCommunicationDraft } from "./communicationDraftService";

const fullIdentity: JobHuntNormalizedIdentity = {
  company: "Acme",
  role: "Engineer",
  recruiterName: "Taylor Recruiter",
};

const signalWithIdentity: GmailSignal = {
  id: "m1",
  threadId: "t1",
  from: "Taylor <t@acme.com>",
  subject: "Next steps",
  snippet: "Hello",
  date: "2025-06-15T14:00:00.000Z",
  job_hunt_analysis: {
    signals: ["interview_request"],
    confidence: 0.9,
    suggestedActions: ["create_followup_task"],
    normalizedIdentity: fullIdentity,
  },
};

describe("communicationDraftService", () => {
  it("defaults to English when language omitted", () => {
    const out = buildCommunicationDraft({
      type: "follow_up",
      signal: signalWithIdentity,
    });
    expect(out.language).toBe("en");
    expect(out.subject).toMatch(/Following up/i);
    expect(out.body).toMatch(/Hi Taylor,/);
    expect(out.body).toMatch(/\[Your name\]/);
  });

  it("French follow-up uses Relance and Cordialement", () => {
    const out = buildCommunicationDraft({
      type: "follow_up",
      signal: signalWithIdentity,
      language: "fr",
    });
    expect(out.language).toBe("fr");
    expect(out.subject).toMatch(/Relance/);
    expect(out.body).toMatch(/Bonjour Taylor,/);
    expect(out.body).toMatch(/\[Votre nom\]/);
  });

  it("English interview accept with concrete time", () => {
    const out = buildCommunicationDraft({
      type: "interview_accept",
      signal: signalWithIdentity,
      language: "en",
      interviewStartIso: "2025-06-20T15:00:00.000Z",
    });
    expect(out.subject).toMatch(/Interview confirmation/);
    expect(out.body).toMatch(/Confirmed for/);
    expect(out.body.toLowerCase()).not.toMatch(/finalize/);
  });

  it("French interview accept with neutral wording without time", () => {
    const out = buildCommunicationDraft({
      type: "interview_accept",
      signal: signalWithIdentity,
      language: "fr",
    });
    expect(out.subject).toMatch(/Confirmation d'entrevue/);
    expect(out.body).toMatch(/horaire à confirmer/);
  });

  it("English reschedule", () => {
    const out = buildCommunicationDraft({
      type: "interview_reschedule",
      signal: signalWithIdentity,
      language: "en",
    });
    expect(out.subject).toMatch(/reschedule request/);
    expect(out.body).toMatch(/move the interview/);
  });

  it("French thank-you", () => {
    const out = buildCommunicationDraft({
      type: "thank_you",
      signal: signalWithIdentity,
      language: "fr",
    });
    expect(out.subject).toMatch(/^Merci/);
    expect(out.body).toMatch(/conversation d'aujourd'hui/);
  });

  it("fallback when identity fields missing uses Hi, and opportunity wording", () => {
    const bareSignal: GmailSignal = {
      id: "m2",
      threadId: "t2",
      from: "Someone <x@y.com>",
      subject: "Hello",
      snippet: "Ping",
      date: "2025-06-15T10:00:00.000Z",
    };
    const en = buildCommunicationDraft({ type: "follow_up", signal: bareSignal, language: "en" });
    expect(en.body).toMatch(/^Hi,/m);
    expect(en.body).toMatch(/the opportunity/);

    const fr = buildCommunicationDraft({ type: "follow_up", signal: bareSignal, language: "fr" });
    expect(fr.body).toMatch(/^Bonjour,/m);
    expect(fr.body).toMatch(/l'opportunité/);
  });

  it("uses explicit identity when no signal analysis", () => {
    const out = buildCommunicationDraft({
      type: "follow_up",
      identity: fullIdentity,
      language: "en",
    });
    expect(out.subject).toContain("Engineer");
    expect(out.subject).toContain("Acme");
  });

  it("treats non-fr language values as English", () => {
    const out = buildCommunicationDraft({
      type: "follow_up",
      signal: signalWithIdentity,
      language: "xx" as DraftLanguage,
    });
    expect(out.language).toBe("en");
    expect(out.subject).toMatch(/Following up/i);
  });
});
