import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { recoverCreatedTarget } from "@/lib/services/actionRecoveryService";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return jsonLegacyApiError("Unauthorized", 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonLegacyApiError("Invalid JSON body.", 400);
  }

  const record = body as { targetId?: unknown; kind?: unknown };
  const targetId = typeof record.targetId === "string" ? record.targetId.trim() : "";
  const kind = record.kind === "calendar" || record.kind === "todoist" ? record.kind : null;

  if (!targetId || !kind) {
    return jsonLegacyApiError("targetId and kind (calendar | todoist) are required.", 400);
  }

  const result = await recoverCreatedTarget(userId, targetId, kind);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
