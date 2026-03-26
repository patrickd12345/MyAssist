import { NextResponse } from "next/server";
import { lifecycleStageSchema } from "job-hunt-manager/types/lifecycle";
import { updateJobStage } from "@/lib/jobHuntLifecycle";
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
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;
  const stageRaw = typeof o.stage === "string" ? o.stage.trim() : "";
  const parsed = lifecycleStageSchema.safeParse(stageRaw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid stage" }, { status: 400 });
  }
  const notes = typeof o.notes === "string" ? o.notes.trim() : undefined;

  try {
    const lifecycle = await updateJobStage(jobId, parsed.data, notes ? { notes } : undefined);
    return NextResponse.json({ ok: true, lifecycle });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const notFound = msg.includes("No lifecycle") || msg.includes("save_job");
    return NextResponse.json({ ok: false, error: msg }, { status: notFound ? 404 : 400 });
  }
}
