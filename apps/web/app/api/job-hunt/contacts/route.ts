import { NextResponse } from "next/server";
import { createManualContact, listJobHuntContacts, listJobHuntContactsFull } from "@/lib/jobHuntContactsStore";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const input = {
    job_id: typeof o.job_id === "string" ? o.job_id : undefined,
    name: typeof o.name === "string" ? o.name : undefined,
    phone: typeof o.phone === "string" ? o.phone : undefined,
    email: typeof o.email === "string" ? o.email : undefined,
    role: typeof o.role === "string" ? o.role : undefined,
    company: typeof o.company === "string" ? o.company : undefined,
    linked_job_ids: Array.isArray(o.linked_job_ids) ? o.linked_job_ids : undefined,
  };

  try {
    const person = await createManualContact(userId, {
      ...input,
      linked_job_ids: Array.isArray(input.linked_job_ids)
        ? input.linked_job_ids.filter((x): x is string => typeof x === "string")
        : undefined,
    });
    return NextResponse.json({ ok: true, person });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
