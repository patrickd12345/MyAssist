import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { integrationService } from "@/lib/integrations/service";
import { resolveTodoistApiToken } from "@/lib/todoistToken";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!taskId?.trim()) {
    return NextResponse.json({ error: "Task ID is required." }, { status: 400 });
  }

  try {
    const integrated = await integrationService.completeTodoistTask(userId, taskId);
    if (integrated.ok) {
      return NextResponse.json({ ok: true, taskId });
    }

    const token = await resolveTodoistApiToken(userId);
    if (!token) {
      return NextResponse.json(
        { error: "Todoist is disconnected. Connect Todoist in Integrations first." },
        { status: 409 },
      );
    }

    const response = await fetch(
      `https://api.todoist.com/api/v1/tasks/${encodeURIComponent(taskId)}/close`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        {
          error: `Todoist close failed with ${response.status}: ${text.slice(0, 300)}`,
        },
        { status: response.status },
      );
    }

    return NextResponse.json({ ok: true, taskId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Todoist error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
