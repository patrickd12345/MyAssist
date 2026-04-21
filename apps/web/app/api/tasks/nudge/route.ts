import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { getSessionUserId } from "@/lib/session";
import { logServerEvent } from "@/lib/serverLog";
import { storeTaskNudge } from "@/lib/memoryStore";

export async function POST(req: Request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return jsonLegacyApiError("Unauthorized", 401);
    }

    const body = await req.json();
    const { run_date, taskId, direction, taskText } = body;

    if (!run_date || !taskId || !direction || !taskText) {
      return jsonLegacyApiError("Missing required fields", 400);
    }

    if (direction !== "up" && direction !== "down") {
      return jsonLegacyApiError("Invalid direction", 400);
    }

    await storeTaskNudge(userId, {
      run_date,
      taskId,
      direction,
      taskText,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logServerEvent("error", "tasks_nudge_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonLegacyApiError("Failed to store task nudge", 500);
  }
}
