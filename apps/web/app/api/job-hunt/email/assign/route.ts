import { NextResponse } from "next/server";
import { assignEmailSignalToJob } from "@/lib/jobHuntEmailAssignment";
import { getSessionUserId } from "@/lib/session";
import type { GmailSignal } from "@/lib/types";

export const dynamic = "force-dynamic";

function isSignal(value: unknown): value is GmailSignal {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.from === "string" &&
    typeof o.subject === "string" &&
    typeof o.snippet === "string" &&
    typeof o.date === "string"
  );
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
  const job_id = typeof o.job_id === "string" ? o.job_id.trim() : "";
  const signal = o.signal;
  if (!job_id) {
    return NextResponse.json({ ok: false, error: "job_id is required" }, { status: 400 });
  }
  if (!isSignal(signal)) {
    return NextResponse.json({ ok: false, error: "signal is required" }, { status: 400 });
  }
  const autoExtractContact = o.auto_extract_contact !== false;

  try {
    const out = await assignEmailSignalToJob(userId, {
      job_id,
      signal,
      autoExtractContact,
    });
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const notFound = msg.includes("No lifecycle");
    return NextResponse.json({ ok: false, error: msg }, { status: notFound ? 404 : 500 });
  }
}
