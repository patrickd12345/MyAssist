import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { getSessionUserId } from "@/lib/session";
import { integrationService } from "@/lib/integrations/service";
import { resolveTodoistApiToken } from "@/lib/todoistToken";
import { logKpiProviderAction } from "@/lib/productKpi";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const userId = await getSessionUserId();
  if (!userId) {
    return jsonLegacyApiError("Unauthorized", 401);
  }

  if (!taskId?.trim()) {
    return jsonLegacyApiError("Task ID is required.", 400);
  }

  try {
    const integrated = await integrationService.completeTodoistTask(userId, taskId);
    if (integrated.ok) {
      logKpiProviderAction({ provider: "todoist", action: "complete_task", ok: true });
      return NextResponse.json({ ok: true, taskId });
    }

    const token = await resolveTodoistApiToken(userId);
    if (!token) {
      return jsonLegacyApiError("Todoist is disconnected. Connect Todoist in Integrations first.", 409);
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
      logKpiProviderAction({
        provider: "todoist",
        action: "complete_task",
        ok: false,
        status: response.status,
      });
      return jsonLegacyApiError(
        `Todoist close failed with ${response.status}: ${text.slice(0, 300)}`,
        response.status,
      );
    }

    logKpiProviderAction({ provider: "todoist", action: "complete_task", ok: true });
    return NextResponse.json({ ok: true, taskId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Todoist error";
    return jsonLegacyApiError(String(message ), 502);
  }
}
