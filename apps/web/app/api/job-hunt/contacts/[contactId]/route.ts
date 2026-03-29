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
  const patch: Parameters<typeof updateJobHuntContact>[2] = {};
  if (o.job_id !== undefined) patch.job_id = typeof o.job_id === "string" ? o.job_id : "";
  if (o.name !== undefined) patch.name = typeof o.name === "string" ? o.name : undefined;
  if (o.phone !== undefined) patch.phone = typeof o.phone === "string" ? o.phone : undefined;
  if (o.email !== undefined) patch.email = typeof o.email === "string" ? o.email : undefined;
  if (o.role !== undefined) patch.role = typeof o.role === "string" ? o.role : undefined;
  if (o.company !== undefined) patch.company = typeof o.company === "string" ? o.company : undefined;
  if (Array.isArray(o.linked_job_ids)) {
    patch.linked_job_ids = o.linked_job_ids.filter((x): x is string => typeof x === "string");
  }

  try {
    const person = await updateJobHuntContact(userId, contactId, patch);
    if (!person) {
      return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, person });
  } catch (e) {
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
