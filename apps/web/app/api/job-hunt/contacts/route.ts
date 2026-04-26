import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { createManualContact, listJobHuntContacts, listJobHuntContactsFull } from "@/lib/jobHuntContactsStore";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return jsonLegacyApiError("Unauthorized", 401);
  }

  const incoming = new URL(req.url);
  const full = incoming.searchParams.get("full") === "1" || incoming.searchParams.get("full") === "true";
  const lim = Math.min(Math.max(Number(incoming.searchParams.get("limit")) || 25, 1), 500);

  try {
    const data = full ? await listJobHuntContactsFull(userId) : await listJobHuntContacts(userId, lim);
    return NextResponse.json({
      ok: true,
      people: data.people,
      loose_notes: data.loose_notes,
      updated_at: data.updated_at,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;

  // Validation to prevent excessively large inputs or invalid types
  const validateString = (val: unknown, maxLen: number, fieldName: string) => {
    if (val === undefined || val === null) return undefined;
    if (typeof val !== "string") {
      throw { status: 400, message: `${fieldName} must be a string` };
    }
    const s = val.trim();
    if (s.length > maxLen) {
      throw { status: 400, message: `${fieldName} exceeds maximum length of ${maxLen}` };
    }
    return s;
  };

  try {
    const job_id = validateString(o.job_id, 255, "job_id") ?? "";
    const name = validateString(o.name, 255, "name");
    const phone = validateString(o.phone, 50, "phone");
    const email = validateString(o.email, 255, "email");
    const role = validateString(o.role, 255, "role");
    const company = validateString(o.company, 255, "company");

    if (email && !email.includes("@")) {
      throw { status: 400, message: "Invalid email format" };
    }

    let linked_job_ids: string[] | undefined;
    if (o.linked_job_ids !== undefined) {
      if (!Array.isArray(o.linked_job_ids)) {
        throw { status: 400, message: "linked_job_ids must be an array" };
      }
      if (o.linked_job_ids.length > 50) {
        throw { status: 400, message: "Too many linked jobs" };
      }
      linked_job_ids = o.linked_job_ids
        .map((id, i) => validateString(id, 255, `linked_job_ids[${i}]`))
        .filter((x): x is string => !!x);
    }

    const person = await createManualContact(userId, {
      job_id,
      name,
      phone,
      email,
      role,
      company,
      linked_job_ids,
    });
    return NextResponse.json({ ok: true, person });
  } catch (e: any) {
    if (e && typeof e === "object" && "status" in e) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
