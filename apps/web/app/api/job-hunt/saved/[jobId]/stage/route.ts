import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { lifecycleStageSchema } from "job-hunt-manager/types/lifecycle";
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";
import { updateJobStage } from "@/lib/jobHuntLifecycle";
import { maybeCreateTodoistTaskForJobStage } from "@/lib/jobHuntStageTodoistSync";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

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
    if (parsed.data === "interview_scheduled") {
      const prepWebhook = resolveMyAssistRuntimeEnv().jobHuntPrepWebhook;
      if (prepWebhook) {
        void fetch(prepWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: jobId, stage: parsed.data }),
        }).catch(() => {});
      }
    }
    const todoistSync = await maybeCreateTodoistTaskForJobStage(userId, {
      jobId,
      stage: parsed.data,
      note: notes,
    });
    return NextResponse.json({ ok: true, lifecycle, todoist_sync: todoistSync });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const notFound = msg.includes("No lifecycle") || msg.includes("save_job");
    return NextResponse.json({ ok: false, error: msg }, { status: notFound ? 404 : 400 });
  }
}
