import { NextResponse } from "next/server";
import { recoverCreatedTarget } from "@/lib/services/actionRecoveryService";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const record = body as { targetId?: unknown; kind?: unknown };
  const targetId = typeof record.targetId === "string" ? record.targetId.trim() : "";
  const kind = record.kind === "calendar" || record.kind === "todoist" ? record.kind : null;

  if (!targetId || !kind) {
    return NextResponse.json({ error: "targetId and kind (calendar | todoist) are required." }, { status: 400 });
  }

  const result = await recoverCreatedTarget(userId, targetId, kind);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
