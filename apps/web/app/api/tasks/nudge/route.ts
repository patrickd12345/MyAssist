import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { auth } from "@/lib/auth";
import { logServerEvent } from "@/lib/serverLog";
import { storeTaskNudge } from "@/lib/memoryStore";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
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

    await storeTaskNudge(session.user.id, {
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
