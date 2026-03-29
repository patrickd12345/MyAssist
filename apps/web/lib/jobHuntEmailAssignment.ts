import "server-only";

import type { GmailSignal, JobHuntEmailMatch } from "./types";
import {
  createManualContact,
  linkContactToJob,
  listJobHuntContactsFull,
  type JobHuntPersonContact,
} from "./jobHuntContactsStore";
import { resolveMyAssistRuntimeEnv } from "./env/runtime";

function dataPath(): string | undefined {
  return resolveMyAssistRuntimeEnv().jobHuntDataPath || undefined;
}

function clean(v: string | null | undefined): string {
  return (v ?? "").trim();
}

function lower(v: string | null | undefined): string {
  return clean(v).toLowerCase();
}

function extractEmail(from: string): string | undefined {
  const m = from.match(/<([^>]+)>/);
  const value = (m ? m[1] : from).trim().toLowerCase();
  if (!value || !value.includes("@")) return undefined;
  return value;
}

function extractName(from: string): string | undefined {
  const withoutAngle = from.replace(/<[^>]*>/g, "").trim();
  const withoutQuotes = withoutAngle.replace(/^"+|"+$/g, "").trim();
  if (!withoutQuotes) return undefined;
  if (withoutQuotes.includes("@")) return undefined;
  return withoutQuotes;
}

function extractPhone(text: string): string | undefined {
  const m = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  return m ? m[0].trim() : undefined;
}

function extractRoleAndCompany(text: string): { role?: string; company?: string } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const parts = line.split(/\s+at\s+/i);
    if (parts.length === 2) {
      const role = clean(parts[0]);
      const company = clean(parts[1]);
      return {
        role: role || undefined,
        company: company || undefined,
      };
    }
  }
  return {};
}

function extractContact(signal: GmailSignal): {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  company?: string;
} {
  const from = clean(signal.from);
  const snippet = clean(signal.snippet);
  const roleCompany = extractRoleAndCompany(snippet);
  return {
    name: extractName(from),
    email: extractEmail(from),
    phone: extractPhone(snippet),
    role: roleCompany.role,
    company: roleCompany.company,
  };
}

function findExistingContact(
  contacts: JobHuntPersonContact[],
  extracted: ReturnType<typeof extractContact>,
): JobHuntPersonContact | undefined {
  const email = lower(extracted.email);
  const phoneDigits = clean(extracted.phone).replace(/\D/g, "");
  if (email) {
    const byEmail = contacts.find((p) => lower(p.email) === email);
    if (byEmail) return byEmail;
  }
  if (phoneDigits) {
    const byPhone = contacts.find((p) => clean(p.phone).replace(/\D/g, "") === phoneDigits);
    if (byPhone) return byPhone;
  }
  const name = lower(extracted.name);
  const company = lower(extracted.company);
  if (name) {
    const byNameCompany = contacts.find((p) => lower(p.name) === name && lower(p.company) === company);
    if (byNameCompany) return byNameCompany;
  }
  return undefined;
}

async function upsertContactFromSignal(
  userId: string,
  jobId: string,
  signal: GmailSignal,
): Promise<{ contact_id?: string; created: boolean }> {
  const extracted = extractContact(signal);
  if (!extracted.name && !extracted.email && !extracted.phone) {
    return { created: false };
  }
  const all = await listJobHuntContactsFull(userId);
  const existing = findExistingContact(all.people, extracted);
  if (existing) {
    await linkContactToJob(userId, existing.id, jobId);
    return { contact_id: existing.id, created: false };
  }
  const created = await createManualContact(userId, {
    job_id: "",
    linked_job_ids: [jobId],
    name: extracted.name,
    email: extracted.email,
    phone: extracted.phone,
    role: extracted.role,
    company: extracted.company,
  });
  return { contact_id: created.id, created: true };
}

export async function assignEmailSignalToJob(
  userId: string,
  input: {
    job_id: string;
    signal: GmailSignal;
    autoExtractContact?: boolean;
  },
): Promise<{ ok: true; touchpoint_logged: boolean; contact_id?: string; contact_created?: boolean }> {
  const { HuntService } = await import("job-hunt-manager/services/hunt-service");
  const svc = new HuntService(dataPath());
  await svc.logTouchpoint({
    id: input.job_id,
    channel: "email",
    direction: "incoming",
    subject: clean(input.signal.subject) || "(no subject)",
    body_summary: clean(input.signal.snippet).slice(0, 500) || undefined,
    signal_ref: `${input.signal.id ?? ""}|${input.signal.threadId ?? ""}|manual_assign`,
  });

  let contact_id: string | undefined;
  let contact_created = false;
  if (input.autoExtractContact !== false) {
    const upsert = await upsertContactFromSignal(userId, input.job_id, input.signal);
    contact_id = upsert.contact_id;
    contact_created = upsert.created;
  }

  return {
    ok: true,
    touchpoint_logged: true,
    ...(contact_id ? { contact_id } : {}),
    ...(contact_id ? { contact_created } : {}),
  };
}

export async function syncContactsFromJobHuntEmailMatches(
  userId: string,
  matches: JobHuntEmailMatch[],
): Promise<void> {
  for (const m of matches) {
    try {
      await upsertContactFromSignal(userId, m.job_id, {
        id: null,
        threadId: null,
        from: m.signal.from,
        subject: m.signal.subject,
        snippet: m.signal.snippet,
        date: m.signal.date,
      });
    } catch {
      // Best effort only: matching and daily context should not fail due to contact extraction.
    }
  }
}
