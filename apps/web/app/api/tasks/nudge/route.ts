import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { storeTaskNudge } from "@/lib/memoryStore";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { run_date, taskId, direction, taskText } = body;

    if (!run_date || !taskId || !direction || !taskText) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (direction !== "up" && direction !== "down") {
      return NextResponse.json({ error: "Invalid direction" }, { status: 400 });
    }

    await storeTaskNudge(session.user.id, {
      run_date,
      taskId,
      direction,
      taskText,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[tasks/nudge] Error:", error);
    return NextResponse.json({ error: "Failed to store task nudge" }, { status: 500 });
  }
}
