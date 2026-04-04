import "server-only";
import {
  executeChat as executeSharedChat,
  executeEmbedding as executeSharedEmbedding,
} from "@bookiji-inc/ai-runtime";
import {
  commitSessionBoundary,
  emptySessionBoundaryPayload,
  startSession,
} from "@bookiji-inc/persistent-memory-runtime";
import { buildMyAssistBoundaryFromChat } from "@/lib/myassistMemoryBoundary";
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";

export type CanonicalAiMode = "gateway" | "ollama" | "fallback";

export type CanonicalAiMetadata = {
  provider: string;
  model: string;
  mode: CanonicalAiMode;
  latencyMs: number;
  fallbackReason: string | null;
};

export type CanonicalChatMessage = {
  role: "system" | "user";
  content: string;
};

export type CanonicalChatResult = CanonicalAiMetadata & {
  text: string;
};

function resolveMode(): Exclude<CanonicalAiMode, "fallback"> {
  const runtime = resolveMyAssistRuntimeEnv();
  const mode = runtime.aiMode;
  const provider = runtime.aiProvider.toLowerCase();
  if (mode === "gateway" || provider === "gateway") {
    return "gateway";
  }
  return "ollama";
}

function resolveProvider(mode: Exclude<CanonicalAiMode, "fallback">): string {
  const runtime = resolveMyAssistRuntimeEnv();
  return runtime.aiProvider || mode;
}

function resolveModel(mode: Exclude<CanonicalAiMode, "fallback">, override?: string): string {
  if (override?.trim()) {
    return override.trim();
  }
  const runtime = resolveMyAssistRuntimeEnv();
  return mode === "gateway"
    ? runtime.openAiModel
    : runtime.ollamaModel;
}

function resolvePersistentMemoryTenant(): string {
  const fromEnv = process.env.MYASSIST_PERSISTENT_MEMORY_TENANT?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return "default";
}

function injectMemoryContext(
  messages: CanonicalChatMessage[],
  memorySummary: string,
): CanonicalChatMessage[] {
  if (!memorySummary.trim()) {
    return messages;
  }
  const prefix = `[persistent_memory_context]\n${memorySummary.trim()}\n[/persistent_memory_context]`;
  const firstUser = messages.findIndex((m) => m.role === "user");
  if (firstUser < 0) {
    return messages;
  }
  const copy = [...messages];
  copy[firstUser] = {
    ...copy[firstUser],
    content: `${prefix}\n\n${copy[firstUser].content}`,
  };
  return copy;
}

export async function executeChat(args: {
  messages: CanonicalChatMessage[];
  model?: string;
  temperature: number;
  maxTokens: number;
  format?: "json";
}): Promise<CanonicalChatResult> {
  const mode = resolveMode();
  const model = resolveModel(mode, args.model);
  const memoryHandle = await startSession("myassist", resolvePersistentMemoryTenant());
  const prior = memoryHandle.memory.lastCommitted ?? emptySessionBoundaryPayload();
  const memorySummary = [
    prior.sessionSummary,
    ...prior.current_focus,
    ...prior.next_actions.slice(0, 3),
  ]
    .filter(Boolean)
    .join(" | ");
  const messagesWithMemory = injectMemoryContext(args.messages, memorySummary);

  const response = await executeSharedChat({
    messages: messagesWithMemory,
    model,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    format: args.format,
    modeOverride: mode,
    providerOverride: mode,
  });

  try {
    await commitSessionBoundary(
      memoryHandle,
      buildMyAssistBoundaryFromChat(args.messages, response.text),
    );
  } catch {
    /* non-fatal: disk or env may block writes in constrained hosts */
  }

  return {
    text: response.text,
    provider: resolveProvider(mode),
    model,
    mode,
    latencyMs: response.latencyMs,
    fallbackReason: response.fallbackReason,
  };
}

export async function executeEmbedding(text: string): Promise<CanonicalAiMetadata & { embedding: number[] }> {
  const mode = resolveMode();
  const model = resolveModel(mode);
  const response = await executeSharedEmbedding({
    input: text,
    model,
    modeOverride: mode,
    providerOverride: mode,
  });

  return {
    embedding: response.embedding,
    provider: resolveProvider(mode),
    model,
    mode,
    latencyMs: response.latencyMs,
    fallbackReason: response.fallbackReason,
  };
}
