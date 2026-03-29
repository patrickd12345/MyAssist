import "server-only";
import {
  executeChat as executeSharedChat,
  executeEmbedding as executeSharedEmbedding,
} from "@bookiji-inc/ai-runtime";
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

export async function executeChat(args: {
  messages: CanonicalChatMessage[];
  model?: string;
  temperature: number;
  maxTokens: number;
  format?: "json";
}): Promise<CanonicalChatResult> {
  const mode = resolveMode();
  const model = resolveModel(mode, args.model);
  const response = await executeSharedChat({
    messages: args.messages,
    model,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    format: args.format,
    modeOverride: mode,
    providerOverride: mode,
  });

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
