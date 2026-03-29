import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { linkContactToJob, unlinkContactFromJob } from "@/lib/jobHuntContactsStore";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Link an existing CRM contact to this saved job. */
export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) {
    return jsonLegacyApiError("Unauthorized", 401);
  }

  const { jobId: rawId } = await ctx.params;
  const jobId = decodeURIComponent(rawId ?? "").trim();
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "Missing job id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const cid =
    body && typeof body === "object" && typeof (body as { contact_id?: unknown }).contact_id === "string"
      ? (body as { contact_id: string }).contact_id.trim()
      : "";
  if (!cid) {
    return NextResponse.json({ ok: false, error: "contact_id is required" }, { status: 400 });
  }

  try {
    const person = await linkContactToJob(userId, cid, jobId);
    if (!person) {
      return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, person });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** Unlink a CRM contact from this saved job (remove posting id only). */
export async function DELETE(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) {
    return jsonLegacyApiError("Unauthorized", 401);
  }

  const { jobId: rawId } = await ctx.params;
  const jobId = decodeURIComponent(rawId ?? "").trim();
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "Missing job id" }, { status: 400 });
  }

  const cid = new URL(req.url).searchParams.get("contact_id")?.trim() ?? "";
  if (!cid) {
    return NextResponse.json({ ok: false, error: "contact_id query is required" }, { status: 400 });
  }

  try {
    const person = await unlinkContactFromJob(userId, cid, jobId);
    if (!person) {
      return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, person });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
