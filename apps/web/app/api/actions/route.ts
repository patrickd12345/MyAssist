import { NextResponse } from "next/server";
import { createCrossSystemActionService, type ActionName } from "@/lib/services/crossSystemActionService";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const ALLOWED_ACTIONS: ActionName[] = [
  "email_to_task",
  "email_to_event",
  "task_to_calendar_block",
  "complete_task",
  "archive_email",
];

function isActionName(value: unknown): value is ActionName {
  return typeof value === "string" && (ALLOWED_ACTIONS as string[]).includes(value);
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const record = body as { action?: unknown; sourceId?: unknown };
  const action = record.action;
  const sourceId = typeof record.sourceId === "string" ? record.sourceId.trim() : "";

  if (!isActionName(action)) {
    return NextResponse.json({ error: "Unknown or missing action." }, { status: 400 });
  }

  if (!sourceId) {
    return NextResponse.json({ error: "sourceId is required." }, { status: 400 });
  }

  const service = createCrossSystemActionService(userId);

  switch (action) {
    case "email_to_task": {
      const result = await service.emailToTask(sourceId);
      return NextResponse.json(result);
    }
    case "email_to_event": {
      const result = await service.emailToEvent(sourceId);
      return NextResponse.json(result);
    }
    case "task_to_calendar_block": {
      const result = await service.taskToCalendarBlock(sourceId);
      return NextResponse.json(result);
    }
    case "complete_task": {
      const result = await service.completeTask(sourceId);
      return NextResponse.json(result);
    }
    case "archive_email": {
      const result = await service.archiveEmail(sourceId);
      return NextResponse.json(result);
    }
    default: {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }
  }
}
