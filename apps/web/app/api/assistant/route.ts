import { NextResponse } from "next/server";
import {
  buildContextDigest,
  buildFallbackReply,
  type AssistantReply,
  type TaskDraft,
} from "@/lib/assistant";
import { fetchDailyContextFromN8n } from "@/lib/fetchDailyContext";
import { isMyAssistDailyContext } from "@/lib/validateContext";
import type { MyAssistDailyContext } from "@/lib/types";

export const dynamic = "force-dynamic";

const OLLAMA_URL = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2:3b";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { message?: unknown; context?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const context = await resolveContext(body.context);
    const reply = await createReply(context, message);
    return NextResponse.json(reply);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function resolveContext(candidate: unknown): Promise<MyAssistDailyContext> {
  if (isMyAssistDailyContext(candidate)) return candidate;
  const { context } = await fetchDailyContextFromN8n();
  return context;
}

async function createReply(context: MyAssistDailyContext, message: string): Promise<AssistantReply> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: "json",
        options: {
          temperature: 0.35,
        },
        messages: [
          {
            role: "system",
            content: [
              "You are MyAssist, a sharp executive operator for a busy founder.",
              "Use only the supplied daily context snapshot. Do not invent facts.",
              "Be direct, useful, and a little forceful. No therapy tone. No fluff.",
              "If the user asks to create a task, return a taskDraft.",
              "Answer in JSON with keys: answer, actions, followUps, taskDraft.",
              "answer: one concise paragraph.",
              "actions: array of up to 3 concrete action strings.",
              "followUps: array of up to 3 short suggested questions.",
              "taskDraft: null unless the user is clearly asking to create a task.",
              "taskDraft.content: concise Todoist task title.",
              "taskDraft.dueString: human due phrase like tomorrow at 9am if present, else null.",
              "taskDraft.description: optional short note, else null.",
              "taskDraft.priority: 1-4 if clearly implied, else null.",
            ].join(" "),
          },
          {
            role: "user",
            content: `Question:\n${message}\n\nDaily context snapshot:\n${buildContextDigest(context)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const payload = (await response.json()) as {
      message?: { content?: string };
      response?: string;
    };

    const raw = payload.message?.content ?? payload.response ?? "";
    const parsed = parseAssistantReply(raw);
    return {
      mode: "ollama",
      answer: parsed.answer,
      actions: parsed.actions,
      followUps: parsed.followUps,
    };
  } catch {
    return buildFallbackReply(context, message);
  }
}

function parseAssistantReply(raw: string): Omit<AssistantReply, "mode"> {
  const fallback = {
    answer: raw.trim() || "I could not generate a useful reply from the current context.",
    actions: [] as string[],
    followUps: [] as string[],
    taskDraft: null as TaskDraft | null,
  };

  try {
    const parsed = JSON.parse(raw) as {
      answer?: unknown;
      actions?: unknown;
      followUps?: unknown;
      taskDraft?: unknown;
    };

    return {
      answer: typeof parsed.answer === "string" && parsed.answer.trim() ? parsed.answer.trim() : fallback.answer,
      actions: Array.isArray(parsed.actions)
        ? parsed.actions.filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(0, 3)
        : [],
      followUps: Array.isArray(parsed.followUps)
        ? parsed.followUps
            .filter((item): item is string => typeof item === "string" && item.trim() !== "")
            .slice(0, 3)
        : [],
      taskDraft: coerceTaskDraft(parsed.taskDraft),
    };
  } catch {
    return fallback;
  }
}

function coerceTaskDraft(value: unknown): TaskDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Record<string, unknown>;
  const content = typeof draft.content === "string" ? draft.content.trim() : "";
  if (!content) return null;

  const priorityRaw = draft.priority;
  const priority =
    priorityRaw === 1 || priorityRaw === 2 || priorityRaw === 3 || priorityRaw === 4
      ? priorityRaw
      : null;

  return {
    content,
    dueString: typeof draft.dueString === "string" && draft.dueString.trim() ? draft.dueString.trim() : null,
    description:
      typeof draft.description === "string" && draft.description.trim() ? draft.description.trim() : null,
    priority,
  };
}
