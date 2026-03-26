import { NextResponse } from "next/server";
import { appendJobTimelineNote } from "@/lib/jobHuntLifecycle";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  if (!(await getSessionUserId())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const detail =
    body && typeof body === "object" && typeof (body as { detail?: unknown }).detail === "string"
      ? (body as { detail: string }).detail.trim()
      : "";
  if (!detail) {
    return NextResponse.json({ ok: false, error: "detail is required" }, { status: 400 });
  }

  try {
    const lifecycle = await appendJobTimelineNote(jobId, detail);
    return NextResponse.json({ ok: true, lifecycle });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const notFound = msg.includes("No lifecycle") || msg.includes("save_job");
    return NextResponse.json({ ok: false, error: msg }, { status: notFound ? 404 : 400 });
  }
}
