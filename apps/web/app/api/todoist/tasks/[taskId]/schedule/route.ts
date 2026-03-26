import { NextResponse } from "next/server";
import { storeResolvedItem } from "@/lib/memoryStore";
import { getSessionUserId } from "@/lib/session";
import { resolveTodoistApiToken } from "@/lib/todoistToken";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = await resolveTodoistApiToken(userId);

  if (!token) {
    return NextResponse.json(
      { error: "TODOIST_API_TOKEN is not configured for dashboard task actions." },
      { status: 500 },
    );
  }

  const body = (await req.json()) as {
    dueString?: unknown;
    dueLang?: unknown;
    intent?: unknown;
    taskContent?: unknown;
    run_date?: unknown;
  };
  const dueString = typeof body.dueString === "string" ? body.dueString.trim() : "";
  const dueLang = typeof body.dueLang === "string" ? body.dueLang.trim() : "en";
  const intent = typeof body.intent === "string" ? body.intent.trim() : "";
  const taskContent =
    typeof body.taskContent === "string" ? body.taskContent.trim() : "";
  const runDate =
    typeof body.run_date === "string" && body.run_date.trim() !== ""
      ? body.run_date.trim()
      : new Date().toISOString().slice(0, 10);

  if (!taskId?.trim()) {
    return NextResponse.json({ error: "Task ID is required." }, { status: 400 });
  }

  if (!dueString) {
    return NextResponse.json({ error: "dueString is required." }, { status: 400 });
  }

  try {
    const response = await fetch(`https://api.todoist.com/api/v1/tasks/${encodeURIComponent(taskId)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        due_string: dueString,
        due_lang: dueLang,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        {
          error: `Todoist reschedule failed with ${response.status}: ${text.slice(0, 300)}`,
        },
        { status: response.status },
      );
    }

    const payload = await response.json();

    if (intent) {
      const label = taskContent || "(untitled task)";
      const text = `Snoozed task "${label}" because: ${intent}`;
      try {
        await storeResolvedItem(userId, {
          text,
          source: "generic",
          run_date: runDate,
        });
      } catch (memoryError) {
        console.error("[schedule] Failed to store snooze intent:", memoryError);
      }
    }

    return NextResponse.json({ ok: true, taskId, task: payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Todoist error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
