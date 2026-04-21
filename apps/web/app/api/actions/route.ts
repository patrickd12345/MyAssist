import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { createCrossSystemActionService } from "@/lib/services/crossSystemActionService";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const ALLOWED_ACTIONS = [
  "email_to_task",
  "email_to_event",
  "task_to_calendar_block",
  "calendar_create_manual",
  "job_hunt_prep_tasks",
  "complete_task",
  "archive_email",
] as const;

type LocalActionName = typeof ALLOWED_ACTIONS[number];

function isActionName(value: unknown): value is LocalActionName {
  return typeof value === "string" && (ALLOWED_ACTIONS as readonly string[]).includes(value);
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return jsonLegacyApiError("Unauthorized", 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonLegacyApiError("Invalid JSON body.", 400);
  }

  const record = body as {
    action?: unknown;
    sourceId?: unknown;
    payload?: unknown;
  };
  const action = record.action;
  const sourceId = typeof record.sourceId === "string" ? record.sourceId.trim() : "";

  if (!isActionName(action)) {
    return jsonLegacyApiError("Unknown or missing action.", 400);
  }

  if (action !== "calendar_create_manual" && !sourceId) {
    return jsonLegacyApiError("sourceId is required.", 400);
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
    case "calendar_create_manual": {
      const payload = record.payload;
      if (!payload || typeof payload !== "object") {
        return jsonLegacyApiError("payload is required for calendar_create_manual.", 400);
      }
      const p = payload as Record<string, unknown>;
      const summary = typeof p.summary === "string" ? p.summary.trim() : "";
      const description = typeof p.description === "string" ? p.description : "";
      const start = typeof p.start === "string" ? p.start.trim() : "";
      const end = typeof p.end === "string" ? p.end.trim() : "";
      const origin = p.origin === "email_to_event" || p.origin === "task_to_calendar_block" ? p.origin : null;
      if (!summary || !start || !end || !origin) {
        return jsonLegacyApiError("Invalid manual calendar payload (summary, start, end, origin).", 400);
      }
      const correlationSourceId =
        typeof p.correlationSourceId === "string" && p.correlationSourceId.trim()
          ? p.correlationSourceId.trim()
          : sourceId;
      const result = await service.createCalendarEventManual({
        summary,
        description,
        startIso: start,
        endIso: end,
        correlationSourceId,
        origin,
      });
      return NextResponse.json(result);
    }
    case "job_hunt_prep_tasks": {
      const result = await service.jobHuntPrepTasks(sourceId);
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
      return jsonLegacyApiError("Unsupported action.", 400);
    }
  }
}
