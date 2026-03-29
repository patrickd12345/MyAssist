import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { integrationService } from "@/lib/integrations/service";
import { storeResolvedItem } from "@/lib/memoryStore";
import { logServerEvent } from "@/lib/serverLog";
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
    return jsonLegacyApiError("Unauthorized", 401);
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
    return jsonLegacyApiError("Task ID is required.", 400);
  }

  if (!dueString) {
    return jsonLegacyApiError("dueString is required.", 400);
  }

  try {
    const integrated = await integrationService.rescheduleTodoistTask(userId, {
      taskId,
      dueString,
      dueLang,
    });
    let payload: unknown;
    if (integrated.ok) {
      payload = integrated.payload;
    } else {
      const token = await resolveTodoistApiToken(userId);
      if (!token) {
        return jsonLegacyApiError("Todoist is disconnected. Connect Todoist in Integrations first.", 409);
      }
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
        return jsonLegacyApiError(
          `Todoist reschedule failed with ${response.status}: ${text.slice(0, 300)}`,
          response.status,
        );
      }
      payload = await response.json();
    }

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
        logServerEvent("warn", "todoist_schedule_store_resolved_item_failed", {
          taskId,
          error: memoryError instanceof Error ? memoryError.message : String(memoryError),
        });
      }
    }

    return NextResponse.json({ ok: true, taskId, task: payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Todoist error";
    return jsonLegacyApiError(String(message ), 502);
  }
}
