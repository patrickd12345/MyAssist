type ChatMessage = { role: string; content: string };

export type ExecuteChatInput = {
  messages: ChatMessage[];
  model: string;
  temperature: number;
  maxTokens: number;
  format?: "json";
  modeOverride?: string;
  providerOverride?: string;
};

export type ExecuteChatResult = {
  text: string;
  latencyMs: number;
  fallbackReason: string | null;
};

export type ExecuteEmbeddingInput = {
  input: string;
  model: string;
  modeOverride?: string;
  providerOverride?: string;
};

export type ExecuteEmbeddingResult = {
  embedding: number[];
  latencyMs: number;
  fallbackReason: string | null;
};

function readEnv(key: string, fallback = ""): string {
  const v = typeof process !== "undefined" ? process.env[key] : undefined;
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

async function fetchOllamaChat(input: ExecuteChatInput, start: number): Promise<ExecuteChatResult> {
  const base = readEnv("OLLAMA_BASE_URL", readEnv("OLLAMA_API_URL", "http://127.0.0.1:11434")).replace(
    /\/$/,
    "",
  );
  const url = `${base}/api/chat`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        stream: false,
        options: {
          temperature: input.temperature,
          num_predict: input.maxTokens,
        },
        format: input.format === "json" ? "json" : undefined,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`ollama_${res.status}`);
    }
    const json = (await res.json()) as { message?: { content?: string } };
    const text = typeof json.message?.content === "string" ? json.message.content : "";
    return { text, latencyMs: Date.now() - start, fallbackReason: null };
  } catch (cause) {
    throw cause instanceof Error ? cause : new Error(String(cause));
  }
}

async function fetchGatewayChat(input: ExecuteChatInput, start: number): Promise<ExecuteChatResult> {
  const base = readEnv("VERCEL_AI_BASE_URL", readEnv("AI_GATEWAY_BASE_URL", ""));
  const key = readEnv("VERCEL_VIRTUAL_KEY", readEnv("AI_GATEWAY_API_KEY", readEnv("OPENAI_API_KEY", "")));
  if (!base || !key) {
    return {
      text: "",
      latencyMs: Date.now() - start,
      fallbackReason: "gateway_not_configured",
    };
  }
  const url = `${base.replace(/\/$/, "")}/v1/chat/completions`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature,
        max_tokens: input.maxTokens,
        response_format: input.format === "json" ? { type: "json_object" } : undefined,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`gateway_${res.status}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    return { text, latencyMs: Date.now() - start, fallbackReason: null };
  } catch (cause) {
    throw cause instanceof Error ? cause : new Error(String(cause));
  }
}

export async function executeChat(input: ExecuteChatInput): Promise<ExecuteChatResult> {
  const start = Date.now();
  const mode = (input.modeOverride || input.providerOverride || "ollama").toLowerCase();
  if (mode === "gateway") {
    return fetchGatewayChat(input, start);
  }
  return fetchOllamaChat(input, start);
}

async function fetchOllamaEmbedding(input: ExecuteEmbeddingInput, start: number): Promise<ExecuteEmbeddingResult> {
  const base = readEnv("OLLAMA_BASE_URL", readEnv("OLLAMA_API_URL", "http://127.0.0.1:11434")).replace(
    /\/$/,
    "",
  );
  const url = `${base}/api/embeddings`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: input.model, prompt: input.input }),
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        embedding: [],
        latencyMs: Date.now() - start,
        fallbackReason: `ollama_embed_${res.status}`,
      };
    }
    const json = (await res.json()) as { embedding?: number[] };
    const embedding = Array.isArray(json.embedding) ? json.embedding : [];
    return { embedding, latencyMs: Date.now() - start, fallbackReason: null };
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : "ollama_embed_unreachable";
    return { embedding: [], latencyMs: Date.now() - start, fallbackReason: msg };
  }
}

async function fetchGatewayEmbedding(
  input: ExecuteEmbeddingInput,
  start: number,
): Promise<ExecuteEmbeddingResult> {
  const base = readEnv("VERCEL_AI_BASE_URL", readEnv("AI_GATEWAY_BASE_URL", ""));
  const key = readEnv("VERCEL_VIRTUAL_KEY", readEnv("AI_GATEWAY_API_KEY", readEnv("OPENAI_API_KEY", "")));
  if (!base || !key) {
    return {
      embedding: [],
      latencyMs: Date.now() - start,
      fallbackReason: "gateway_embed_not_configured",
    };
  }
  const url = `${base.replace(/\/$/, "")}/v1/embeddings`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: input.model, input: input.input }),
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        embedding: [],
        latencyMs: Date.now() - start,
        fallbackReason: `gateway_embed_${res.status}`,
      };
    }
    const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const embedding = json.data?.[0]?.embedding ?? [];
    return { embedding, latencyMs: Date.now() - start, fallbackReason: null };
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : "gateway_embed_unreachable";
    return { embedding: [], latencyMs: Date.now() - start, fallbackReason: msg };
  }
}

export async function executeEmbedding(input: ExecuteEmbeddingInput): Promise<ExecuteEmbeddingResult> {
  const start = Date.now();
  const mode = (input.modeOverride || input.providerOverride || "ollama").toLowerCase();
  if (mode === "gateway") {
    return fetchGatewayEmbedding(input, start);
  }
  return fetchOllamaEmbedding(input, start);
}
