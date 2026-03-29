import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { getSessionUserId } from "@/lib/session";
import { resolveTodoistApiToken } from "@/lib/todoistToken";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return jsonLegacyApiError("Unauthorized", 401);
  }

  const token = await resolveTodoistApiToken(userId);

  if (!token) {
    return jsonLegacyApiError("TODOIST_API_TOKEN is not configured for dashboard task creation.", 500);
  }

  const body = (await req.json()) as {
    content?: unknown;
    description?: unknown;
    dueString?: unknown;
    priority?: unknown;
  };

  const content = typeof body.content === "string" ? body.content.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const dueString = typeof body.dueString === "string" ? body.dueString.trim() : "";
  const priority =
    body.priority === 1 || body.priority === 2 || body.priority === 3 || body.priority === 4
      ? body.priority
      : undefined;

  if (!content) {
    return jsonLegacyApiError("Task content is required.", 400);
  }

  try {
    const response = await fetch("https://api.todoist.com/api/v1/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        ...(description ? { description } : {}),
        ...(dueString ? { due_string: dueString, due_lang: "en" } : {}),
        ...(priority ? { priority } : {}),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      return jsonLegacyApiError(
        `Todoist create failed with ${response.status}: ${text.slice(0, 300)}`,
        response.status,
      );
    }

    const task = await response.json();
    return NextResponse.json({ ok: true, task });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Todoist error";
    return jsonLegacyApiError(String(message ), 502);
  }
}
