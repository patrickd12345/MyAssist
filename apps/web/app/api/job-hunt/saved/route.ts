import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";
import { appendContactsFromParsedNotes } from "@/lib/jobHuntContactsStore";
import { parseJobNotesForContacts } from "@/lib/parseJobNotesContacts";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const DEFAULT_DIGEST_URL = "http://127.0.0.1:3847/digest";

function digestBase(): string {
  return resolveMyAssistRuntimeEnv().jobHuntDigestUrl || DEFAULT_DIGEST_URL;
}

export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return jsonLegacyApiError("Unauthorized", 401);
  }

  const incoming = new URL(req.url);
  const savedBase = new URL("/saved-jobs", digestBase());
  incoming.searchParams.forEach((v, k) => {
    savedBase.searchParams.set(k, v);
  });
  const url = savedBase.toString();

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text();
      return jsonLegacyApiError(`Upstream error: ${res.status} ${text}`, 502);
    }
    const data = (await res.json()) as unknown;
    return NextResponse.json(data);
  } catch (e) {
    return jsonLegacyApiError(e instanceof Error ? e.message : String(e), 500);
  }
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return jsonLegacyApiError("Unauthorized", 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonLegacyApiError("Invalid JSON", 400);
  }
  if (!body || typeof body !== "object") {
    return jsonLegacyApiError("Expected JSON object", 400);
  }
  const o = body as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) {
    return jsonLegacyApiError("Missing id", 400);
  }
  const payload: Record<string, unknown> = { id };
  if (o.new_track !== undefined && o.new_track !== null && typeof o.new_track === "object" && !Array.isArray(o.new_track)) {
    payload.new_track = o.new_track;
  } else if (typeof o.track === "string" && o.track.trim()) {
    payload.track = o.track.trim();
  }
  if (typeof o.notes === "string") payload.notes = o.notes;
  const extractContacts = o.extract_contacts === true;
  const notesForParse = typeof o.notes === "string" ? o.notes.trim() : "";

  const saveUrl = new URL("/save-job", digestBase()).toString();

  try {
    const res = await fetch(saveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = (await res.json()) as { ok?: boolean; error?: string; saved?: unknown };
    if (!res.ok) {
      return jsonLegacyApiError(data.error ?? `Upstream HTTP ${res.status}`, res.status === 400 ? 400 : 502);
    }
    if (!data.ok) {
      return NextResponse.json(data);
    }

    let contacts_extraction: {
      people_added: number;
      loose_notes_added: number;
      parse_mode: "ollama" | "heuristic" | "none";
    } | undefined;

    if (extractContacts && notesForParse.length > 0) {
      try {
        const parsed = await parseJobNotesForContacts(notesForParse);
        const appended = await appendContactsFromParsedNotes(userId, id, parsed.contacts, parsed.other_comments);
        contacts_extraction = {
          people_added: appended.people_added,
          loose_notes_added: appended.notes_added,
          parse_mode: parsed.parse_mode,
        };
      } catch {
        contacts_extraction = {
          people_added: 0,
          loose_notes_added: 0,
          parse_mode: "none",
        };
      }
    }

    return NextResponse.json(
      contacts_extraction ? { ...data, contacts_extraction } : data,
    );
  } catch (e) {
    return jsonLegacyApiError(e instanceof Error ? e.message : String(e), 500);
  }
}
