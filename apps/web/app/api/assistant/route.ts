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
import { fetchDailyContextLive } from "@/lib/fetchDailyContext";
import {
  getResolvedItems,
  getRollingMemoryPrompt,
  storeBriefFeedback,
  storeResolvedItem,
  storeSituationBrief,
} from "@/lib/memoryStore";
import { maybeHandleJobHuntAssistantCommand } from "@/lib/jobHuntAssistantTools";
import { executeChat, type CanonicalAiMetadata } from "@/lib/aiRuntime";
import { getApiRequestId, jsonApiError, toApiHttpError } from "@/lib/api/error-contract";
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";
import { logAiServerEvent, logServerEvent } from "@/lib/serverLog";
import { getSessionUserId } from "@/lib/session";
import { isMyAssistDailyContext } from "@/lib/validateContext";
import type { MyAssistDailyContext, SituationBrief } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Chat path: try primary then these. Heavier models may OOM on low-RAM machines. */
const OLLAMA_MODEL_FALLBACKS = ["phi3:mini", "llama3.1:8b", "mistral:latest"];

/** Headline path: lightweight-first so mode=ollama succeeds without huge RAM. Override with OLLAMA_HEADLINE_MODELS=comma,separated */
const DEFAULT_HEADLINE_MODELS = [
  "mistral:latest",
  "qwen2.5:0.5b",
  "tinyllama:latest",
];

export async function POST(req: Request) {
  const requestId = getApiRequestId(req);
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return jsonApiError("unauthorized", "Unauthorized", 401, requestId);
    }

    const body = (await req.json()) as {
      message?: unknown;
      context?: unknown;
      kind?: unknown;
      rating?: unknown;
      note?: unknown;
      run_date?: unknown;
      text?: unknown;
      source?: unknown;
      energyLevel?: unknown;
      resolution_feedback?: unknown;
    };
    const energyLevel = parseEnergyLevel(body.energyLevel);
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const kind =
      body.kind === "headline" ||
      body.kind === "chat" ||
      body.kind === "situation_brief" ||
      body.kind === "situation_feedback" ||
      body.kind === "resolve_item" ||
      body.kind === "memory_status"
        ? body.kind
        : "chat";

    if (kind === "chat" && !message) {
      return jsonApiError("message_required", "Message is required.", 400, requestId);
    }

    if (kind === "situation_feedback") {
      const rating =
        body.rating === "useful" || body.rating === "needs_work" ? body.rating : null;
      const runDate = typeof body.run_date === "string" ? body.run_date.trim() : "";
      if (!rating || !runDate) {
        return jsonApiError(
          "invalid_feedback_request",
          "run_date and rating are required for situation feedback.",
          400,
          requestId,
        );
      }
      const note = typeof body.note === "string" ? body.note.trim() : "";
      const persisted = await storeBriefFeedback(userId, {
        run_date: runDate,
        rating,
        note: note || undefined,
      });
      return NextResponse.json({ ok: true, memory_entries: persisted.entries });
    }

    if (kind === "resolve_item") {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      const source =
        body.source === "email" ||
        body.source === "priority" ||
        body.source === "risk" ||
        body.source === "next_action" ||
        body.source === "generic"
          ? body.source
          : null;
      const runDate = typeof body.run_date === "string" ? body.run_date.trim() : "";
      const resolutionFeedback =
        body.resolution_feedback === "junk" || body.resolution_feedback === "useful_action"
          ? body.resolution_feedback
          : undefined;
      if (!text || !source || !runDate) {
        return jsonApiError(
          "invalid_resolve_request",
          "text, source, and run_date are required to resolve an item.",
          400,
          requestId,
        );
      }
      const persisted = await storeResolvedItem(userId, {
        text,
        source,
        run_date: runDate,
        feedback: resolutionFeedback,
      });
      return NextResponse.json({ ok: true, memory_entries: persisted.entries });
    }

    if (kind === "memory_status") {
      const resolvedItems = await getResolvedItems(userId);
      return NextResponse.json({ resolved_items: resolvedItems });
    }

    const context = await resolveContext(body.context, userId);
    const reply =
      kind === "headline"
        ? await createHeadline(context)
        : kind === "situation_brief"
          ? await createSituationBrief(context, userId, energyLevel)
          : kind === "chat" && isSituationBriefQuestion(message)
            ? await createChiefOfStaffChatReply(context, userId, energyLevel)
          : await createReply(context, message, userId);
    return NextResponse.json(reply);
  } catch (error) {
    const normalized = toApiHttpError(error, {
      fallbackCode: "assistant_route_failed",
      fallbackMessage: "Unknown error",
      fallbackStatus: 500,
      requestId,
    });
    logServerEvent("error", "assistant_route_failed", {
      requestId,
      code: normalized.code,
      status: normalized.status ?? 500,
    });
    return jsonApiError(normalized.code, normalized.message, 500, requestId);
  }
}

async function resolveContext(candidate: unknown, userId: string): Promise<MyAssistDailyContext> {
  if (isMyAssistDailyContext(candidate)) return candidate;
  const { context } = await fetchDailyContextLive(userId);
  return context;
}

type AssistantApiMode = "ollama" | "fallback" | "gateway";

type SituationBriefResponse = {
  mode: AssistantApiMode;
  brief: SituationBrief;
  memory_entries?: number;
  briefModel?: string;
} & CanonicalAiMetadata;

type AssistantRouteResponse = Omit<AssistantReply, "mode"> & {
  mode: AssistantApiMode;
} & CanonicalAiMetadata;

type EnergyLevel = "high" | "normal" | "low";

function parseEnergyLevel(raw: unknown): EnergyLevel {
  if (raw === "high" || raw === "normal" || raw === "low") return raw;
  return "normal";
}

function buildEnergySituationInstructions(energy: EnergyLevel): string {
  if (energy === "low") {
    return [
      "CRITICAL USER CONTEXT: The user reports low energy ('Brain Fried').",
      "Prioritize quick wins, light admin, and small steps; recommend deferring heavy deep work or cognitively demanding tasks unless truly urgent.",
      "In defer_recommendations and next_actions, favor recovery-friendly moves; mention protecting rest where appropriate.",
      "In pressure_summary, acknowledge capacity honestly without being preachy.",
    ].join(" ");
  }
  if (energy === "high") {
    return [
      "CRITICAL USER CONTEXT: The user reports high energy.",
      "Surface the hardest strategic or deep-work blockers as top priorities when the snapshot supports it.",
      "In next_actions, encourage tackling the most valuable demanding work while energy is available.",
    ].join(" ");
  }
  return "";
}

async function createChiefOfStaffChatReply(
  context: MyAssistDailyContext,
  userId: string,
  energyLevel: EnergyLevel,
): Promise<AssistantRouteResponse> {
  const result = await createSituationBrief(context, userId, energyLevel);
  const actions = result.brief.next_actions.slice(0, 2);
  const followUps = [
    "What should I focus on first today?",
    "What can I safely defer?",
  ];

  return {
    mode: result.mode,
    answer: result.brief.pressure_summary,
    actions,
    followUps,
    taskDraft: null,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    fallbackReason: result.fallbackReason ?? null,
  };
}

async function createReply(context: MyAssistDailyContext, message: string, userId: string): Promise<AssistantRouteResponse> {
  const jobHuntToolReply = await maybeHandleJobHuntAssistantCommand(userId, message);
  if (jobHuntToolReply) {
    return {
      ...jobHuntToolReply,
      provider: "fallback",
      model: "fallback",
      latencyMs: 0,
      fallbackReason: null,
    };
  }
  try {
    const memoryPrompt = await getRollingMemoryPrompt(userId, context);
    
    const result = await executeChat({
      format: "json",
      temperature: 0.2,
      maxTokens: 220,
      messages: [
        {
          role: "system",
          content: [
            "You are MyAssist, a sharp executive operator for a busy founder.",
            "Use the supplied daily context snapshot and historical memory to answer.",
            "Do not invent facts.",
            "Be direct, useful, and a little forceful. No therapy tone. No fluff.",
            "If the user asks about past context, use the Rolling Memory JSON to inform your answer.",
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
          content: `Question:\n${message}\n\nDaily context snapshot:\n${buildContextDigest(context)}\n\nHistorical Rolling Memory:\n${memoryPrompt}`,
        },
      ],
    });
    const parsed = parseAssistantReply(result.text);
    const response = {
      mode: result.mode,
      answer: parsed.answer,
      actions: parsed.actions,
      followUps: parsed.followUps,
      taskDraft: parsed.taskDraft,
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      fallbackReason: result.fallbackReason,
    };
    logAiServerEvent("assistant_chat_completed", response, { route: "assistant", kind: "chat" });
    return response;
  } catch (error) {
    const fallback = buildFallbackReply(context, message);
    const response = {
      ...fallback,
      provider: "fallback",
      model: "fallback",
      latencyMs: 0,
      fallbackReason: error instanceof Error ? error.message : "AI request failed",
    };
    logAiServerEvent("assistant_chat_fallback", response, { route: "assistant", kind: "chat" });
    return response;
  }
}

function isSituationBriefQuestion(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("chief of staff") ||
    normalized.includes("summarize my day") ||
    normalized.includes("summary of my day") ||
    (normalized.includes("summarize") && normalized.includes("day"))
  );
}

async function createSituationBrief(
  context: MyAssistDailyContext,
  userId: string,
  energyLevel: EnergyLevel,
): Promise<SituationBriefResponse> {
  const memoryPrompt = await getRollingMemoryPrompt(userId, context);
  const energyInstructions = buildEnergySituationInstructions(energyLevel);
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
              "Use rolling memory to recognize repeated unresolved priorities, risks, and commitments across days.",
              "If a risk or priority has appeared repeatedly, escalate it instead of treating it like a brand-new observation.",
              "Rolling memory may include snoozed/deferred tasks with reasons (e.g. needs focus time, blocked on someone else, low priority).",
              "If the same task or pattern appears often with snooze reasons like needs focus time, recommend breaking the work into smaller steps or scheduling a protected deep-work block in next_actions.",
              "If snooze reasons indicate waiting on others, suggest a concrete follow-up or escalation in next_actions or defer_recommendations.",
              energyInstructions,
              "Return valid JSON with keys:",
              "pressure_summary (string),",
              "top_priorities (array of 3 to 5 strings),",
              "conflicts_and_risks (array of 2 to 4 strings),",
              "defer_recommendations (array of 2 to 4 strings),",
              "next_actions (array of 3 to 5 strings),",
              "confidence_and_limits (string),",
              "memory_insights (array of 0 to 3 strings).",
              "Keep each array item concise and actionable.",
              "Prefer action-oriented phrasing over raw email subject lines when possible.",
            ]
              .filter((line) => line.trim() !== "")
              .join(" "),
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
      const brief = parseSituationBrief(raw.text, context);
      const persisted = await storeSituationBrief(userId, context, brief);
      const response = {
        mode: raw.mode,
        brief,
        memory_entries: persisted.entries,
        briefModel: raw.model,
        provider: raw.provider,
        model: raw.model,
        latencyMs: raw.latencyMs,
        fallbackReason: raw.fallbackReason,
      };
      logAiServerEvent("assistant_situation_brief_completed", response, {
        route: "assistant",
        kind: "situation_brief",
      });
      return response;
    } catch (error) {
      attemptErrors.push(
        `${model}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 220),
      );
    }
  }

  const fallback = buildSituationBriefFallback(context);
  const persisted = await storeSituationBrief(userId, context, fallback);
  const response: SituationBriefResponse = {
    mode: "fallback",
    brief: fallback,
    memory_entries: persisted.entries,
    provider: "fallback",
    model: "fallback",
    latencyMs: 0,
    fallbackReason: attemptErrors.slice(0, 6).join(" | "),
  };
  logAiServerEvent("assistant_situation_brief_fallback", response, {
    route: "assistant",
    kind: "situation_brief",
  });
  return response;
}

type HeadlineApiResponse = {
  mode: AssistantApiMode;
  answer: string;
  headlineModel?: string;
  headlineFallbackReason?: string;
} & CanonicalAiMetadata;

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
        "- Do not name specific task titles or email subjects (those appear elsewhere on the page)",
        "- Summarize using load level and counts only: describe the shape of the day, not a list of items",
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
      const answer = parseHeadlineAnswer(raw.text);
      const response = {
        mode: raw.mode,
        answer,
        headlineModel: raw.model,
        provider: raw.provider,
        model: raw.model,
        latencyMs: raw.latencyMs,
        fallbackReason: raw.fallbackReason,
      };
      logAiServerEvent("assistant_headline_completed", response, {
        route: "assistant",
        kind: "headline",
      });
      return response;
    } catch (error) {
      attemptErrors.push(
        `${model}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200),
      );
    }
  }

  const response: HeadlineApiResponse = {
    mode: "fallback",
    answer: buildHeadlineFallback(context),
    provider: "fallback",
    model: "fallback",
    latencyMs: 0,
    fallbackReason:
      attemptErrors.length > 0
        ? attemptErrors.slice(0, 6).join(" | ")
        : "No headline models configured or all attempts failed.",
    headlineFallbackReason:
      attemptErrors.length > 0
        ? attemptErrors.slice(0, 6).join(" | ")
        : "No headline models configured or all attempts failed.",
  };
  logAiServerEvent("assistant_headline_fallback", response, {
    route: "assistant",
    kind: "headline",
  });
  return response;
}

function getHeadlineCandidateModels(): string[] {
  const runtime = resolveMyAssistRuntimeEnv();
  if (runtime.aiMode === "gateway" || runtime.aiProvider.toLowerCase() === "gateway") {
    return [runtime.openAiModel || "gpt-4o-mini"];
  }
  const fromEnv = runtime.ollamaHeadlineModels.trim();
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
): Promise<CanonicalAiMetadata & { text: string }> {
  return executeChat({
    model,
    temperature: body.options.temperature,
    maxTokens: body.options.num_predict,
    format: body.format,
    messages: body.messages,
  });
}

function getSituationCandidateModels(): string[] {
  const runtime = resolveMyAssistRuntimeEnv();
  if (runtime.aiMode === "gateway" || runtime.aiProvider.toLowerCase() === "gateway") {
    return [runtime.openAiModel || "gpt-4o-mini"];
  }
  const fromEnv = runtime.ollamaSituationModels.trim();
  if (fromEnv) {
    return fromEnv
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean)
      .filter((model, index, array) => array.indexOf(model) === index);
  }
  return [runtime.ollamaModel, ...DEFAULT_HEADLINE_MODELS, ...OLLAMA_MODEL_FALLBACKS].filter(
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

  if (source.length > 200) {
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
    .replace(/^overdue tasks:\s*/i, "")
    .replace(/^important emails:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const shortened = cleaned.slice(0, 120);
  if (!shortened) return "";
  return shortened.charAt(0).toUpperCase() + shortened.slice(1);
}

function headlineLoadLevel(context: MyAssistDailyContext): "Low" | "Medium" | "High" {
  const urgent = context.todoist_overdue.length + context.todoist_due_today.length;
  const score =
    urgent * 3 + Math.min(context.gmail_signals.length, 5) + Math.min(context.calendar_today.length, 5);
  if (score >= 24) return "High";
  if (score >= 12) return "Medium";
  return "Low";
}

/** Counts + load only — avoids repeating task/email titles in the hero line (see First move + lists below). */
function buildHeadlineDigest(context: MyAssistDailyContext): string {
  const urgent = context.todoist_overdue.length + context.todoist_due_today.length;
  const summary = {
    run_date: context.run_date,
    overdue_count: context.todoist_overdue.length,
    due_today_count: context.todoist_due_today.length,
    calendar_events_count: context.calendar_today.length,
    email_signals_count: context.gmail_signals.length,
    urgent_total: urgent,
    load_level: headlineLoadLevel(context),
  };

  return JSON.stringify(summary, null, 2);
}

function parseAssistantReply(raw: string): Omit<AssistantReply, "mode"> {
  const fallback = {
    answer: "I could not generate a useful reply from the current context.",
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

    const answer =
      typeof parsed.answer === "string" && parsed.answer.trim() ? parsed.answer.trim() : null;
    if (!answer) {
      throw new Error("Assistant response did not include answer");
    }

    return {
      answer,
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
    const plainText = raw.trim();
    if (!plainText) return fallback;

    // Guardrail: avoid rendering raw context JSON when the model fails schema adherence.
    if (looksLikeContextDump(plainText)) return fallback;

    return {
      answer: plainText,
      actions: [],
      followUps: [],
      taskDraft: null,
    };
  }
}

function looksLikeContextDump(text: string): boolean {
  if (!text.trim().startsWith("{")) return false;
  return (
    /"run_date"\s*:/.test(text) &&
    (/"urgent_counts"\s*:/.test(text) ||
      /"todoist_overdue"\s*:/.test(text) ||
      /"gmail_signals"\s*:/.test(text))
  );
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
