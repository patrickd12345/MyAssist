import { NextResponse } from "next/server";
import {
  buildContextDigest,
  buildHeadlineFallback,
  buildFallbackReply,
  buildSituationBriefFallback,
  buildSituationDigest,
  type AssistantReply,
  type TaskDraft,
} from "@/lib/assistant";
import { fetchDailyContextFromN8n } from "@/lib/fetchDailyContext";
import { getRollingMemoryPrompt, storeBriefFeedback, storeSituationBrief } from "@/lib/memoryStore";
import { isMyAssistDailyContext } from "@/lib/validateContext";
import type { MyAssistDailyContext, SituationBrief } from "@/lib/types";

export const dynamic = "force-dynamic";

const OLLAMA_URL = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "tinyllama:latest";
/** Chat path: try primary then these. Heavier models may OOM on low-RAM machines. */
const OLLAMA_MODEL_FALLBACKS = ["phi3:mini", "llama3.1:8b", "mistral:latest"];

/** Headline path: lightweight-first so mode=ollama succeeds without huge RAM. Override with OLLAMA_HEADLINE_MODELS=comma,separated */
const DEFAULT_HEADLINE_MODELS = [
  "mistral:latest",
  "qwen2.5:0.5b",
  "tinyllama:latest",
];

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      message?: unknown;
      context?: unknown;
      kind?: unknown;
      rating?: unknown;
      note?: unknown;
      run_date?: unknown;
    };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const kind =
      body.kind === "headline" ||
      body.kind === "chat" ||
      body.kind === "situation_brief" ||
      body.kind === "situation_feedback"
        ? body.kind
        : "chat";

    if (kind === "chat" && !message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    if (kind === "situation_feedback") {
      const rating =
        body.rating === "useful" || body.rating === "needs_work" ? body.rating : null;
      const runDate = typeof body.run_date === "string" ? body.run_date.trim() : "";
      if (!rating || !runDate) {
        return NextResponse.json(
          { error: "run_date and rating are required for situation feedback." },
          { status: 400 },
        );
      }
      const note = typeof body.note === "string" ? body.note.trim() : "";
      const persisted = await storeBriefFeedback({
        run_date: runDate,
        rating,
        note: note || undefined,
      });
      return NextResponse.json({ ok: true, memory_entries: persisted.entries });
    }

    const context = await resolveContext(body.context);
    const reply =
      kind === "headline"
        ? await createHeadline(context)
        : kind === "situation_brief"
          ? await createSituationBrief(context)
          : await createReply(context, message);
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

type SituationBriefResponse = {
  mode: "ollama" | "fallback";
  brief: SituationBrief;
  memory_entries?: number;
  briefModel?: string;
  fallbackReason?: string;
};

async function createReply(context: MyAssistDailyContext, message: string): Promise<AssistantReply> {
  try {
    const raw = await requestOllama({
      format: "json",
      options: {
        temperature: 0.2,
        num_predict: 220,
      },
      messages: [
        {
          role: "system",
          content: [
            "You are MyAssist, a sharp executive operator for a busy founder.",
            "Use only the supplied daily context snapshot. Do not invent facts.",
            "Be direct, useful, and a little forceful. No therapy tone. No fluff.",
            "Keep answers short because this is a life assistant, not a strategy memo.",
            "If the user asks to create a task, return a taskDraft.",
            "Answer in JSON with keys: answer, actions, followUps, taskDraft.",
            "answer: one concise paragraph.",
            "actions: array of 1 to 2 concrete action strings.",
            "followUps: array of 1 to 2 short suggested questions.",
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
    });
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

async function createSituationBrief(
  context: MyAssistDailyContext,
): Promise<SituationBriefResponse> {
  const memoryPrompt = await getRollingMemoryPrompt(context);
  const candidateModels = getSituationCandidateModels();
  const attemptErrors: string[] = [];

  for (const model of candidateModels) {
    try {
      const raw = await requestOllamaForModel(model, {
        format: "json",
        options: {
          temperature: 0.2,
          num_predict: 420,
        },
        messages: [
          {
            role: "system",
            content: [
              "You are MyAssist Situation Analyst.",
              "Produce one structured daily chief-of-staff brief from the provided snapshot and memory.",
              "Use only provided data. Do not invent meetings, tasks, or emails.",
              "Return valid JSON with keys:",
              "pressure_summary (string),",
              "top_priorities (array of 3 to 5 strings),",
              "conflicts_and_risks (array of 2 to 4 strings),",
              "defer_recommendations (array of 2 to 4 strings),",
              "next_actions (array of 3 to 5 strings),",
              "confidence_and_limits (string),",
              "memory_insights (array of 0 to 3 strings).",
              "Keep each array item concise and actionable.",
            ].join(" "),
          },
          {
            role: "user",
            content: [
              "Daily snapshot JSON:",
              buildSituationDigest(context),
              "",
              "Rolling memory JSON:",
              memoryPrompt,
            ].join("\n"),
          },
        ],
      });
      const brief = parseSituationBrief(raw, context);
      const persisted = await storeSituationBrief(context, brief);
      return {
        mode: "ollama",
        brief,
        memory_entries: persisted.entries,
        briefModel: model,
      };
    } catch (error) {
      attemptErrors.push(
        `${model}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 220),
      );
    }
  }

  const fallback = buildSituationBriefFallback(context);
  const persisted = await storeSituationBrief(context, fallback);
  return {
    mode: "fallback",
    brief: fallback,
    memory_entries: persisted.entries,
    fallbackReason: attemptErrors.slice(0, 6).join(" | "),
  };
}

type HeadlineApiResponse = Pick<AssistantReply, "mode" | "answer"> & {
  headlineModel?: string;
  headlineFallbackReason?: string;
};

async function createHeadline(context: MyAssistDailyContext): Promise<HeadlineApiResponse> {
  const digest = buildHeadlineDigest(context);
  const userBlock = digest;

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    {
      role: "system",
      content: [
        "You are generating a \"New Day One-Liner\".",
        "",
        "From the provided JSON:",
        "- Analyze overdue tasks",
        "- Analyze tasks due today",
        "- Analyze calendar events today",
        "- Analyze important email signals",
        "",
        "Goal:",
        "Produce ONE short sentence that summarizes the user's day at a high level.",
        "",
        "Rules:",
        "- One sentence only",
        "- No bullet points",
        "- No greeting",
        "- No explanation",
        "- No addressing the user",
        "",
        "Tone:",
        "- Neutral",
        "- Concise",
        "- Operational",
      ].join("\n"),
    },
    { role: "user", content: `JSON:\n${userBlock}` },
  ];

  const headlineOptions = {
    temperature: 0.25,
    num_predict: 140,
  };

  const attemptErrors: string[] = [];

  for (const model of getHeadlineCandidateModels()) {
    try {
      const raw = await requestOllamaForModel(model, {
        format: undefined,
        options: headlineOptions,
        messages,
      });
      const answer = parseHeadlineAnswer(raw);
      return { mode: "ollama", answer, headlineModel: model };
    } catch (error) {
      attemptErrors.push(
        `${model}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200),
      );
    }
  }

  return {
    mode: "fallback",
    answer: buildHeadlineFallback(context),
    headlineFallbackReason:
      attemptErrors.length > 0
        ? attemptErrors.slice(0, 6).join(" | ")
        : "No headline models configured or all attempts failed.",
  };
}

async function requestOllama(body: {
  format: "json";
  options: { temperature: number; num_predict: number };
  messages: Array<{ role: "system" | "user"; content: string }>;
}): Promise<string> {
  const models = getCandidateModels();

  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const raw = await requestOllamaForModel(model, body);
      return raw;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("Ollama request failed");
}

function getCandidateModels(): string[] {
  return [OLLAMA_MODEL, ...OLLAMA_MODEL_FALLBACKS].filter(
    (model, index, array) => array.indexOf(model) === index,
  );
}

function getHeadlineCandidateModels(): string[] {
  const fromEnv = process.env.OLLAMA_HEADLINE_MODELS?.trim();
  if (fromEnv) {
    return fromEnv
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean)
      .filter((model, index, array) => array.indexOf(model) === index);
  }
  return DEFAULT_HEADLINE_MODELS.filter((model, index, array) => array.indexOf(model) === index);
}

async function requestOllamaForModel(
  model: string,
  body: {
    format?: "json";
    options: { temperature: number; num_predict: number };
    messages: Array<{ role: "system" | "user"; content: string }>;
  },
): Promise<string> {
  const requestPayload: Record<string, unknown> = {
    model,
    stream: false,
    options: body.options,
    messages: body.messages,
  };
  if (body.format) {
    requestPayload.format = body.format;
  }

  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestPayload),
  });

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status} for ${model}`);
  }

  const ollamaJson = (await response.json()) as {
    message?: { content?: string };
    response?: string;
  };

  const raw = ollamaJson.message?.content ?? ollamaJson.response ?? "";
  if (!raw.trim()) {
    throw new Error(`Empty Ollama response for ${model}`);
  }

  return raw;
}

function getSituationCandidateModels(): string[] {
  const fromEnv = process.env.OLLAMA_SITUATION_MODELS?.trim();
  if (fromEnv) {
    return fromEnv
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean)
      .filter((model, index, array) => array.indexOf(model) === index);
  }
  return [OLLAMA_MODEL, ...DEFAULT_HEADLINE_MODELS, ...OLLAMA_MODEL_FALLBACKS].filter(
    (model, index, array) => array.indexOf(model) === index,
  );
}

function parseHeadlineAnswer(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Empty headline response");
  }

  // Keep JSON support if model follows format, otherwise use raw sentence.
  let source = trimmed;
  try {
    const parsed = JSON.parse(trimmed) as { answer?: unknown };
    if (typeof parsed.answer === "string" && parsed.answer.trim()) {
      source = parsed.answer;
    }
  } catch {
    // Plain-text output is acceptable.
  }

  if (source.length > 300) {
    throw new Error("Headline response too long");
  }

  const cleaned = cleanHeadline(source);
  if (!cleaned) {
    throw new Error("Empty headline after cleaning");
  }

  return cleaned;
}

function cleanHeadline(text: string): string {
  const cleaned = text
    .replace(/^welcome back[.,]?\s*/i, "")
    .replace(/^daily context.*?:\s*/i, "")
    .replace(/^the next message.*?:\s*/i, "")
    .replace(/^the operator.*?\s*/i, "")
    .replace(/^the user's day(?:\s+at\s+the\s+office)?\s+(?:includes|is)\s*/i, "")
    .replace(/^here is.*?:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const shortened = cleaned.slice(0, 140);
  if (!shortened) return "";
  return shortened.charAt(0).toUpperCase() + shortened.slice(1);
}

function buildHeadlineDigest(context: MyAssistDailyContext): string {
  const nextEvent = context.calendar_today[0];
  const topOverdue = context.todoist_overdue[0];
  const topDueToday = context.todoist_due_today[0];
  const topEmail = context.gmail_signals[0];

  const summary = {
    run_date: context.run_date,
    overdue_count: context.todoist_overdue.length,
    due_today_count: context.todoist_due_today.length,
    calendar_events_count: context.calendar_today.length,
    email_signals_count: context.gmail_signals.length,
    top_overdue_task: typeof topOverdue?.content === "string" ? topOverdue.content : null,
    top_due_today_task: typeof topDueToday?.content === "string" ? topDueToday.content : null,
    next_event: nextEvent
      ? {
          summary: nextEvent.summary,
          start: nextEvent.start,
        }
      : null,
    top_email_subject: typeof topEmail?.subject === "string" ? topEmail.subject : null,
  };

  return JSON.stringify(summary, null, 2);
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

function parseSituationBrief(raw: string, context: MyAssistDailyContext): SituationBrief {
  const fallback = buildSituationBriefFallback(context);
  try {
    const parsed = JSON.parse(raw) as Partial<SituationBrief>;
    const toList = (value: unknown, max: number): string[] =>
      Array.isArray(value)
        ? value
            .filter((item): item is string => typeof item === "string" && item.trim() !== "")
            .map((item) => item.trim())
            .slice(0, max)
        : [];
    const brief: SituationBrief = {
      pressure_summary:
        typeof parsed.pressure_summary === "string" && parsed.pressure_summary.trim()
          ? parsed.pressure_summary.trim()
          : fallback.pressure_summary,
      top_priorities: toList(parsed.top_priorities, 5),
      conflicts_and_risks: toList(parsed.conflicts_and_risks, 5),
      defer_recommendations: toList(parsed.defer_recommendations, 5),
      next_actions: toList(parsed.next_actions, 6),
      confidence_and_limits:
        typeof parsed.confidence_and_limits === "string" && parsed.confidence_and_limits.trim()
          ? parsed.confidence_and_limits.trim()
          : fallback.confidence_and_limits,
      memory_insights: toList(parsed.memory_insights, 4),
    };
    if (brief.top_priorities.length === 0) brief.top_priorities = fallback.top_priorities;
    if (brief.conflicts_and_risks.length === 0) brief.conflicts_and_risks = fallback.conflicts_and_risks;
    if (brief.defer_recommendations.length === 0) {
      brief.defer_recommendations = fallback.defer_recommendations;
    }
    if (brief.next_actions.length === 0) brief.next_actions = fallback.next_actions;
    return brief;
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
