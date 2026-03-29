import "server-only";
import { executeChat } from "@/lib/aiRuntime";
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";

const OLLAMA_FALLBACKS = ["phi3:mini", "llama3.1:8b", "mistral:latest"];

export type ExtractedContact = {
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
  company?: string;
};

export type ParseJobNotesResult = {
  contacts: ExtractedContact[];
  other_comments: string[];
  parse_mode: "ollama" | "heuristic" | "none";
};

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function extractEmails(text: string): string[] {
  const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.add(m[0].toLowerCase());
  }
  return [...out];
}

function extractPhones(text: string): string[] {
  const re = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{2,6}/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = normalizeWhitespace(m[0]);
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 10) out.add(raw);
  }
  return [...out];
}

/** e.g. caroline.goulet@x.y → Caroline Goulet */
function inferNameFromEmailLocalPart(email: string): string | undefined {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (!local.includes(".")) return undefined;
  const parts = local.split(".").filter((p) => p.length > 1 && /^[a-z]{2,}$/i.test(p));
  if (parts.length < 2) return undefined;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

/** "The firm referring this job is Randstad." → Randstad */
function extractReferredFirmName(notes: string): string | undefined {
  const m = notes.match(/\breferring this job is\s+([A-Za-z][A-Za-z0-9 &.'-]+?)\s*\./i);
  if (m) return m[1].trim();
  const m2 = notes.match(/\b(?:firm|agency)\s+is\s+([A-Za-z][A-Za-z0-9 &.'-]+?)\s*\./i);
  if (m2) return m2[1].trim();
  return undefined;
}

/** "The status is that she will..." → narrative for other_comments */
function extractStatusNarrative(notes: string): string | undefined {
  const m = notes.match(/\bThe status is\s+(?:that\s+)?([\s\S]+)/i);
  if (!m?.[1]) return undefined;
  let t = m[1].trim().replace(/\s+/g, " ");
  if (!t) return undefined;
  if (!t.endsWith(".")) t += ".";
  return t;
}

function heuristicExtract(notes: string): Omit<ParseJobNotesResult, "parse_mode"> {
  const normalized = notes.replace(/\r\n/g, "\n");
  const emails = extractEmails(normalized);
  const phones = extractPhones(normalized);
  const firm = extractReferredFirmName(normalized);
  const statusLine = extractStatusNarrative(normalized);
  const other_comments: string[] = [];
  if (statusLine) other_comments.push(statusLine);

  const contacts: ExtractedContact[] = [];
  for (const email of emails) {
    const name = inferNameFromEmailLocalPart(email);
    contacts.push({
      email,
      role: "recruiter",
      ...(firm ? { company: firm } : {}),
      ...(name ? { name } : {}),
    });
  }
  for (const phone of phones) {
    contacts.push({ phone, role: "other" });
  }
  return { contacts, other_comments };
}

function safeParseContactsJson(raw: string): { contacts?: unknown[]; other_comments?: unknown[] } | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as { contacts?: unknown[]; other_comments?: unknown[] };
  } catch {
    return null;
  }
}

function normalizeContact(o: unknown): ExtractedContact | null {
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : undefined;
  const phone = typeof r.phone === "string" ? r.phone.trim() : undefined;
  const email = typeof r.email === "string" ? r.email.trim().toLowerCase() : undefined;
  const role = typeof r.role === "string" ? r.role.trim() : undefined;
  const company = typeof r.company === "string" ? r.company.trim() : undefined;
  if (!name && !phone && !email) return null;
  return {
    ...(name ? { name } : {}),
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    ...(role ? { role } : {}),
    ...(company ? { company } : {}),
  };
}

async function requestOllamaJson(model: string, messages: Array<{ role: "system" | "user"; content: string }>) {
  const response = await executeChat({
    model,
    format: "json",
    temperature: 0.2,
    maxTokens: 512,
    messages,
  });
  const raw = response.text;
  if (!raw.trim()) throw new Error("Empty Ollama response");
  return raw;
}

function candidateModels(): string[] {
  const runtime = resolveMyAssistRuntimeEnv();
  return [runtime.ollamaModel, ...OLLAMA_FALLBACKS].filter((m, i, a) => a.indexOf(m) === i);
}

/**
 * Extract recruiter / headhunter contacts and free-form comments from pasted job-hunt notes.
 * Tries Ollama JSON first; falls back to email/phone heuristics.
 */
export async function parseJobNotesForContacts(notes: string): Promise<ParseJobNotesResult> {
  const trimmed = notes.trim();
  if (trimmed.length < 2) {
    return { contacts: [], other_comments: [], parse_mode: "none" };
  }

  const system = `You extract structured hiring contacts from free-form notes (recruiters, headhunters, staffing firms).
Return ONLY valid JSON with this exact shape (no markdown):
{"contacts":[{"name":null,"phone":null,"email":null,"role":null,"company":null}],"other_comments":[]}
Use null for unknown fields. role should be one of: recruiter, headhunter, hiring_manager, internal, coordinator, other.
company: the staffing agency or employer named in the note (e.g. "Randstad" when the note says the firm referring the job is Randstad).
If an email looks like first.last@domain and the person's name is not written out, infer name from the local part (e.g. caroline.goulet@ → Caroline Goulet).
other_comments: narrative updates not stored as one row per person (e.g. "will talk to Dollarama and book an interview").`;

  const user = `Notes:\n${trimmed}`;

  for (const model of candidateModels()) {
    try {
      const raw = await requestOllamaJson(model, [
        { role: "system", content: system },
        { role: "user", content: user },
      ]);
      const parsed = safeParseContactsJson(raw);
      if (!parsed || !Array.isArray(parsed.contacts)) continue;
      const contacts: ExtractedContact[] = [];
      for (const c of parsed.contacts) {
        const n = normalizeContact(c);
        if (n) contacts.push(n);
      }
      const other: string[] = [];
      if (Array.isArray(parsed.other_comments)) {
        for (const x of parsed.other_comments) {
          if (typeof x === "string" && x.trim()) other.push(x.trim());
        }
      }
      if (contacts.length > 0 || other.length > 0) {
        return { contacts, other_comments: other, parse_mode: "ollama" };
      }
    } catch {
      continue;
    }
  }

  const h = heuristicExtract(trimmed);
  if (h.contacts.length === 0 && h.other_comments.length === 0) {
    return { contacts: [], other_comments: [], parse_mode: "none" };
  }
  return { ...h, parse_mode: "heuristic" };
}
