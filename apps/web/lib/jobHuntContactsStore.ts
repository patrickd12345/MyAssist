import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { joinUnderMyAssistMemory } from "@/lib/memoryPaths";
import type { ExtractedContact } from "./parseJobNotesContacts";
import { primaryJobIdIsBlank } from "./jobHuntContactUtils";
import type { JobHuntContactSource, JobHuntPersonContact } from "./jobHuntContactTypes";
export type { JobHuntContactSource, JobHuntPersonContact } from "./jobHuntContactTypes";

function sanitizeUserId(userId: string): string {
  const t = userId.trim();
  if (!t) return "_anonymous";
  return t.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

function contactsFilePath(userId: string): string {
  const safe = sanitizeUserId(userId);
  return joinUnderMyAssistMemory("users", safe, "job-hunt-contacts.json");
}

export type JobHuntLooseNote = {
  id: string;
  job_id: string;
  text: string;
  created_at: string;
};

type ContactsFile = {
  updated_at: string;
  people: JobHuntPersonContact[];
  loose_notes: JobHuntLooseNote[];
};

const MAX_PEOPLE = 400;
const MAX_LOOSE = 200;

function emptyFile(): ContactsFile {
  return { updated_at: new Date().toISOString(), people: [], loose_notes: [] };
}

async function load(userId: string): Promise<ContactsFile> {
  const file = contactsFilePath(userId);
  try {
    const raw = await readFile(file, "utf8");
    const p = JSON.parse(raw) as Partial<ContactsFile>;
    if (!p || typeof p !== "object") return emptyFile();
    const people = Array.isArray(p.people)
      ? p.people.map(normalizePerson).filter((x): x is JobHuntPersonContact => x !== null)
      : [];
    const loose_notes = Array.isArray(p.loose_notes) ? p.loose_notes.filter(isLoose) : [];
    return {
      updated_at: typeof p.updated_at === "string" ? p.updated_at : new Date().toISOString(),
      people,
      loose_notes,
    };
  } catch {
    return emptyFile();
  }
}

function normalizePerson(raw: unknown): JobHuntPersonContact | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.created_at !== "string") return null;
  const srcRaw = o.source;
  const source: JobHuntContactSource = srcRaw === "manual" ? "manual" : "notes_ai_parse";
  const job_id = (typeof o.job_id === "string" ? o.job_id : "").trim();
  const linked = Array.isArray(o.linked_job_ids)
    ? o.linked_job_ids
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
  const out: JobHuntPersonContact = {
    id: o.id,
    job_id,
    name: typeof o.name === "string" ? o.name : undefined,
    phone: typeof o.phone === "string" ? o.phone : undefined,
    email: typeof o.email === "string" ? o.email : undefined,
    role: typeof o.role === "string" ? o.role : undefined,
    company: typeof o.company === "string" ? o.company : undefined,
    source,
    created_at: o.created_at,
  };
  if (linked.length > 0) out.linked_job_ids = linked;
  return out;
}

function isLoose(x: unknown): x is JobHuntLooseNote {
  if (!x || typeof x !== "object") return false;
  const o = x as Partial<JobHuntLooseNote>;
  return typeof o.id === "string" && typeof o.job_id === "string" && typeof o.text === "string" && typeof o.created_at === "string";
}

function normPhone(p?: string): string {
  if (!p) return "";
  return p.replace(/\D/g, "");
}

function normEmail(e?: string): string {
  return (e ?? "").trim().toLowerCase();
}

function isDuplicate(a: JobHuntPersonContact, b: ExtractedContact, jobId: string): boolean {
  if (a.job_id !== jobId) return false;
  const ap = normPhone(a.phone);
  const bp = normPhone(b.phone);
  if (ap && bp && ap === bp) return true;
  const ae = normEmail(a.email);
  const be = normEmail(b.email);
  if (ae && be && ae === be) return true;
  return false;
}

async function persist(userId: string, data: ContactsFile): Promise<void> {
  const file = contactsFilePath(userId);
  await mkdir(path.dirname(file), { recursive: true });
  data.updated_at = new Date().toISOString();
  await writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

export async function appendContactsFromParsedNotes(
  userId: string,
  jobId: string,
  contacts: ExtractedContact[],
  otherComments: string[],
): Promise<{ people_added: number; notes_added: number }> {
  const state = await load(userId);
  const now = new Date().toISOString();
  let people_added = 0;
  const seenBatch = new Set<string>();

  const dedupeKey = (c: ExtractedContact): string => {
    const p = normPhone(c.phone);
    const e = normEmail(c.email);
    if (p || e) return `${p}|${e}`;
    return `n:${(c.name ?? "").trim().toLowerCase()}`;
  };

  for (const c of contacts) {
    const k = dedupeKey(c);
    if (seenBatch.has(k)) continue;
    seenBatch.add(k);
    if (state.people.some((p) => isDuplicate(p, c, jobId))) continue;
    state.people.push({
      id: randomUUID(),
      job_id: jobId,
      name: c.name,
      phone: c.phone,
      email: c.email,
      role: c.role,
      company: c.company,
      source: "notes_ai_parse",
      created_at: now,
    });
    people_added += 1;
  }

  let notes_added = 0;
  for (const text of otherComments) {
    if (!text.trim()) continue;
    state.loose_notes.push({
      id: randomUUID(),
      job_id: jobId,
      text: text.trim(),
      created_at: now,
    });
    notes_added += 1;
  }

  while (state.people.length > MAX_PEOPLE) state.people.shift();
  while (state.loose_notes.length > MAX_LOOSE) state.loose_notes.shift();

  await persist(userId, state);
  return { people_added, notes_added };
}

export async function listJobHuntContacts(userId: string, limit = 30): Promise<ContactsFile> {
  const state = await load(userId);
  const people = [...state.people].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  const loose_notes = [...state.loose_notes].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  return { ...state, people, loose_notes };
}

/** Full rolodex for CRM (still bounded by MAX_PEOPLE in file). */
export async function listJobHuntContactsFull(userId: string): Promise<ContactsFile> {
  const state = await load(userId);
  const people = [...state.people].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const loose_notes = [...state.loose_notes].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { ...state, people, loose_notes };
}

export type ManualContactInput = {
  job_id?: string;
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
  company?: string;
  linked_job_ids?: string[];
};

export async function createManualContact(
  userId: string,
  input: ManualContactInput,
): Promise<JobHuntPersonContact> {
  const state = await load(userId);
  const now = new Date().toISOString();
  const job_id = (input.job_id ?? "").trim();
  const linked = (input.linked_job_ids ?? []).map((s) => s.trim()).filter(Boolean);
  const person: JobHuntPersonContact = {
    id: randomUUID(),
    job_id,
    name: input.name?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    role: input.role?.trim() || undefined,
    company: input.company?.trim() || undefined,
    source: "manual",
    created_at: now,
  };
  if (linked.length > 0) person.linked_job_ids = linked;
  state.people.push(person);
  while (state.people.length > MAX_PEOPLE) state.people.shift();
  await persist(userId, state);
  return person;
}

export async function updateJobHuntContact(
  userId: string,
  contactId: string,
  patch: Partial<ManualContactInput>,
): Promise<JobHuntPersonContact | null> {
  const state = await load(userId);
  const idx = state.people.findIndex((p) => p.id === contactId);
  if (idx < 0) return null;
  const cur = state.people[idx];
  if (patch.job_id !== undefined) cur.job_id = patch.job_id.trim();
  if (patch.name !== undefined) cur.name = patch.name.trim() || undefined;
  if (patch.phone !== undefined) cur.phone = patch.phone.trim() || undefined;
  if (patch.email !== undefined) cur.email = patch.email.trim() || undefined;
  if (patch.role !== undefined) cur.role = patch.role.trim() || undefined;
  if (patch.company !== undefined) cur.company = patch.company.trim() || undefined;
  if (patch.linked_job_ids !== undefined) {
    const linked = patch.linked_job_ids.map((s) => s.trim()).filter(Boolean);
    cur.linked_job_ids = linked.length > 0 ? linked : undefined;
  }
  state.people[idx] = cur;
  await persist(userId, state);
  return cur;
}

export async function deleteJobHuntContact(userId: string, contactId: string): Promise<boolean> {
  const state = await load(userId);
  const before = state.people.length;
  state.people = state.people.filter((p) => p.id !== contactId);
  if (state.people.length === before) return false;
  await persist(userId, state);
  return true;
}

/** Ensure `jobId` is linked to this contact (primary or linked list). */
export async function linkContactToJob(
  userId: string,
  contactId: string,
  jobId: string,
): Promise<JobHuntPersonContact | null> {
  const j = jobId.trim();
  if (!j) return null;
  const state = await load(userId);
  const idx = state.people.findIndex((p) => p.id === contactId);
  if (idx < 0) return null;
  const cur = state.people[idx];
  const primary = String(cur.job_id ?? "").trim();
  if (primary === j) {
    cur.job_id = j;
    await persist(userId, state);
    return cur;
  }
  if (primaryJobIdIsBlank(cur.job_id)) {
    cur.job_id = j;
    const rest = (cur.linked_job_ids ?? []).map((x) => x.trim()).filter(Boolean).filter((id) => id !== j);
    cur.linked_job_ids = rest.length > 0 ? rest : undefined;
  } else {
    const set = new Set((cur.linked_job_ids ?? []).map((x) => x.trim()).filter(Boolean));
    set.add(j);
    cur.linked_job_ids = [...set];
  }
  state.people[idx] = cur;
  await persist(userId, state);
  return cur;
}

/** Remove this posting id from the contact (primary or linked). Does not delete the contact. */
export async function unlinkContactFromJob(
  userId: string,
  contactId: string,
  jobId: string,
): Promise<JobHuntPersonContact | null> {
  const j = jobId.trim();
  if (!j) return null;
  const state = await load(userId);
  const idx = state.people.findIndex((p) => p.id === contactId);
  if (idx < 0) return null;
  const cur = state.people[idx];
  const primary = String(cur.job_id ?? "").trim();
  if (primary === j) {
    const linked = (cur.linked_job_ids ?? []).map((x) => x.trim()).filter(Boolean);
    const [next, ...rest] = linked;
    if (next) {
      cur.job_id = next;
      cur.linked_job_ids = rest.length > 0 ? rest : undefined;
    } else {
      cur.job_id = "";
      cur.linked_job_ids = undefined;
    }
  } else {
    const linked = (cur.linked_job_ids ?? []).map((x) => x.trim()).filter(Boolean).filter((id) => id !== j);
    cur.linked_job_ids = linked.length > 0 ? linked : undefined;
  }
  state.people[idx] = cur;
  await persist(userId, state);
  return cur;
}
