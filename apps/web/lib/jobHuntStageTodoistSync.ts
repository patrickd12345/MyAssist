import "server-only";

import type { LifecycleStage } from "job-hunt-manager/types/lifecycle";
import { resolveTodoistApiToken } from "./todoistToken";

type StageTemplate = {
  dueString: string;
  priority: 1 | 2 | 3 | 4;
  action: string;
};

const STAGE_TASKS: Partial<Record<LifecycleStage, StageTemplate>> = {
  interview_scheduled: { dueString: "tomorrow 8am", priority: 4, action: "Prepare interview briefing" },
  waiting_call: { dueString: "in 3 days", priority: 2, action: "Check in on interview outcome" },
  interviewed: { dueString: "tomorrow 9am", priority: 3, action: "Send interview thank-you follow-up" },
  offer: { dueString: "tomorrow 10am", priority: 4, action: "Review and negotiate offer package" },
};

export async function maybeCreateTodoistTaskForJobStage(
  userId: string,
  input: {
    jobId: string;
    stage: LifecycleStage;
    company?: string;
    title?: string;
    note?: string;
  },
): Promise<{ created: boolean; reason?: string }> {
  const template = STAGE_TASKS[input.stage];
  if (!template) {
    return { created: false, reason: "stage_not_mapped" };
  }
  const token = await resolveTodoistApiToken(userId);
  if (!token) {
    return { created: false, reason: "todoist_token_missing" };
  }
  const role = input.title?.trim() || "role";
  const company = input.company?.trim() || "company";
  const content = `${template.action}: ${company} - ${role}`;
  const description = [
    `Job ID: ${input.jobId}`,
    `Stage changed to: ${input.stage}`,
    input.note ? `Notes: ${input.note}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch("https://api.todoist.com/api/v1/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content,
      description,
      due_string: template.dueString,
      due_lang: "en",
      priority: template.priority,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return { created: false, reason: `todoist_http_${response.status}` };
  }
  return { created: true };
}
