import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const token = process.env.TODOIST_API_TOKEN?.trim();

  if (!token) {
    return NextResponse.json(
      { error: "TODOIST_API_TOKEN is not configured for dashboard task actions." },
      { status: 500 },
    );
  }

  if (!taskId?.trim()) {
    return NextResponse.json({ error: "Task ID is required." }, { status: 400 });
  }

  try {
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
