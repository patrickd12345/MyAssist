import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { deleteJobHuntContact, updateJobHuntContact } from "@/lib/jobHuntContactsStore";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, ctx: { params: Promise<{ contactId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) {
    return jsonLegacyApiError("Unauthorized", 401);
  }

  const { contactId: raw } = await ctx.params;
  const contactId = decodeURIComponent(raw ?? "").trim();
  if (!contactId) {
    return NextResponse.json({ ok: false, error: "Missing contact id" }, { status: 400 });
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
    const patch: Parameters<typeof updateJobHuntContact>[2] = {};
    if (o.job_id !== undefined) patch.job_id = validateString(o.job_id, 255, "job_id") ?? "";
    if (o.name !== undefined) patch.name = validateString(o.name, 255, "name");
    if (o.phone !== undefined) patch.phone = validateString(o.phone, 50, "phone");
    if (o.email !== undefined) {
      const email = validateString(o.email, 255, "email");
      if (email && !email.includes("@")) {
        throw { status: 400, message: "Invalid email format" };
      }
      patch.email = email;
    }
    if (o.role !== undefined) patch.role = validateString(o.role, 255, "role");
    if (o.company !== undefined) patch.company = validateString(o.company, 255, "company");
    if (o.linked_job_ids !== undefined) {
      if (!Array.isArray(o.linked_job_ids)) {
        throw { status: 400, message: "linked_job_ids must be an array" };
      }
      if (o.linked_job_ids.length > 50) {
        throw { status: 400, message: "Too many linked jobs" };
      }
      patch.linked_job_ids = o.linked_job_ids
        .map((id, i) => validateString(id, 255, `linked_job_ids[${i}]`))
        .filter((x): x is string => !!x);
    }

    const person = await updateJobHuntContact(userId, contactId, patch);
    if (!person) {
      return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, person });
  } catch (e: any) {
    if (e && typeof e === "object" && "status" in e) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ contactId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) {
    return jsonLegacyApiError("Unauthorized", 401);
  }

  const { contactId: raw } = await ctx.params;
  const contactId = decodeURIComponent(raw ?? "").trim();
  if (!contactId) {
    return NextResponse.json({ ok: false, error: "Missing contact id" }, { status: 400 });
  }

  try {
    const ok = await deleteJobHuntContact(userId, contactId);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
