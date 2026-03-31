import "server-only";

type EnvSource = NodeJS.ProcessEnv;

function readFirst(env: EnvSource, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

export type MyAssistRuntimeEnv = {
  aiMode: "gateway" | "ollama" | "fallback";
  aiProvider: string;
  vercelAiBaseUrl: string;
  vercelVirtualKey: string;
  openAiModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaHeadlineModels: string;
  ollamaSituationModels: string;
  ollamaEmailImportanceModel: string;
  ollamaEmailImportanceModels: string;
  authSecret: string;
  nodeEnv: string;
  nextPhase: string;
  registrationInviteCode: string;
  authUrl: string;
  nextAuthUrl: string;
  publicAppUrl: string;
  authDisabledRaw: string;
  devUserId: string;
  gmailMarkReadWebhookUrl: string;
  jobHuntDigestUrl: string;
  jobHuntPrepWebhook: string;
  supabaseProjectUrl: string;
  supabaseSecretKey: string;
  todoistApiToken: string;
  integrationsEncryptionKey: string;
  googleClientId: string;
  googleClientSecret: string;
  todoistClientId: string;
  todoistClientSecret: string;
  myassistUseMockContext: string;
  myassistEnableEmailImportanceAi: string;
  /** When "1" / "true", optional ai-core one-line summary for `daily_intelligence` (deterministic path always runs). */
  myassistDailyIntelAi: string;
  myassistDisableJobHuntSignals: string;
  jobHuntSignalsUrl: string;
  jobHuntDataPath: string;
  myassistMemoryRoot: string;
  vercel: string;
  vercelEnv: string;
  myassistMemoryFile: string;
  myassistUserStoreFile: string;
  myassistTaskDayTz: string;
};

export function resolveMyAssistRuntimeEnv(env: EnvSource = process.env): MyAssistRuntimeEnv {
  const aiModeRaw = readFirst(env, ["AI_MODE"]).toLowerCase();
  const aiMode = aiModeRaw === "gateway" || aiModeRaw === "fallback" ? aiModeRaw : "ollama";
  const aiProvider = readFirst(env, ["AI_PROVIDER"], aiMode);
  const vercelAiBaseUrl = readFirst(env, ["VERCEL_AI_BASE_URL", "AI_GATEWAY_BASE_URL"]);
  const vercelVirtualKey = readFirst(env, ["VERCEL_VIRTUAL_KEY", "AI_GATEWAY_API_KEY", "OPENAI_API_KEY"]);
  const openAiModel = readFirst(env, ["OPENAI_MODEL", "AI_GATEWAY_MODEL"], "gpt-4o-mini");
  const ollamaBaseUrl = readFirst(env, ["OLLAMA_BASE_URL", "OLLAMA_API_URL"], "http://127.0.0.1:11434");
  const ollamaModel = readFirst(env, ["OLLAMA_MODEL", "LLM_MODEL"], "tinyllama:latest");
  const ollamaHeadlineModels = readFirst(env, ["OLLAMA_HEADLINE_MODELS"]);
  const ollamaSituationModels = readFirst(env, ["OLLAMA_SITUATION_MODELS"]);
  const ollamaEmailImportanceModel = readFirst(env, ["OLLAMA_EMAIL_IMPORTANCE_MODEL"]);
  const ollamaEmailImportanceModels = readFirst(env, ["OLLAMA_EMAIL_IMPORTANCE_MODELS"]);
  const authSecret = readFirst(env, ["AUTH_SECRET", "NEXTAUTH_SECRET"]);
  const nodeEnv = readFirst(env, ["NODE_ENV"]);
  const nextPhase = readFirst(env, ["NEXT_PHASE"]);
  const registrationInviteCode = readFirst(env, ["MYASSIST_REGISTRATION_INVITE_CODE"]);
  const authUrl = readFirst(env, ["AUTH_URL"]);
  const nextAuthUrl = readFirst(env, ["NEXTAUTH_URL"]);
  const publicAppUrl = readFirst(env, ["MYASSIST_PUBLIC_APP_URL"]);
  const authDisabledRaw = readFirst(env, ["MYASSIST_AUTH_DISABLED"]);
  const devUserId = readFirst(env, ["MYASSIST_DEV_USER_ID"]);
  const gmailMarkReadWebhookUrl = readFirst(env, ["MYASSIST_GMAIL_MARK_READ_WEBHOOK_URL"]);
  const jobHuntDigestUrl = readFirst(env, ["JOB_HUNT_DIGEST_URL"]);
  const jobHuntPrepWebhook = readFirst(env, ["MYASSIST_JOB_HUNT_PREP_WEBHOOK"]);
  const supabaseProjectUrl = readFirst(env, ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL"]);
  const supabaseSecretKey = readFirst(env, ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
  const todoistApiToken = readFirst(env, ["TODOIST_API_TOKEN"]);
  const integrationsEncryptionKey = readFirst(env, ["MYASSIST_INTEGRATIONS_ENCRYPTION_KEY"]);
  const googleClientId = readFirst(env, [
    "GOOGLE_CLIENT_ID",
    "MYASSIST_GMAIL_CLIENT_ID",
    "MYASSIST_GOOGLE_CLIENT_ID",
  ]);
  const googleClientSecret = readFirst(env, [
    "GOOGLE_CLIENT_SECRET",
    "MYASSIST_GMAIL_CLIENT_SECRET",
    "MYASSIST_GOOGLE_CLIENT_SECRET",
  ]);
  const todoistClientId = readFirst(env, ["TODOIST_CLIENT_ID", "MYASSIST_TODOIST_CLIENT_ID"]);
  const todoistClientSecret = readFirst(env, ["TODOIST_CLIENT_SECRET", "MYASSIST_TODOIST_CLIENT_SECRET"]);
  const myassistUseMockContext = readFirst(env, ["MYASSIST_USE_MOCK_CONTEXT"]);
  const myassistEnableEmailImportanceAi = readFirst(env, ["MYASSIST_ENABLE_EMAIL_IMPORTANCE_AI"]);
  const myassistDailyIntelAi = readFirst(env, ["MYASSIST_DAILY_INTEL_AI"]);
  const myassistDisableJobHuntSignals = readFirst(env, ["MYASSIST_DISABLE_JOB_HUNT_SIGNALS"]);
  const jobHuntSignalsUrl = readFirst(env, ["JOB_HUNT_SIGNALS_URL"]);
  const jobHuntDataPath = readFirst(env, ["JOB_HUNT_DATA_PATH"]);
  const myassistMemoryRoot = readFirst(env, ["MYASSIST_MEMORY_ROOT"]);
  const vercel = readFirst(env, ["VERCEL"]);
  const vercelEnv = readFirst(env, ["VERCEL_ENV"]);
  const myassistMemoryFile = readFirst(env, ["MYASSIST_MEMORY_FILE"]);
  const myassistUserStoreFile = readFirst(env, ["MYASSIST_USER_STORE_FILE"]);
  const myassistTaskDayTz = readFirst(env, ["MYASSIST_TASK_DAY_TZ"]);

  return {
    aiMode,
    aiProvider,
    vercelAiBaseUrl,
    vercelVirtualKey,
    openAiModel,
    ollamaBaseUrl,
    ollamaModel,
    ollamaHeadlineModels,
    ollamaSituationModels,
    ollamaEmailImportanceModel,
    ollamaEmailImportanceModels,
    authSecret,
    nodeEnv,
    nextPhase,
    registrationInviteCode,
    authUrl,
    nextAuthUrl,
    publicAppUrl,
    authDisabledRaw,
    devUserId,
    gmailMarkReadWebhookUrl,
    jobHuntDigestUrl,
    jobHuntPrepWebhook,
    supabaseProjectUrl,
    supabaseSecretKey,
    todoistApiToken,
    integrationsEncryptionKey,
    googleClientId,
    googleClientSecret,
    todoistClientId,
    todoistClientSecret,
    myassistUseMockContext,
    myassistEnableEmailImportanceAi,
    myassistDailyIntelAi,
    myassistDisableJobHuntSignals,
    jobHuntSignalsUrl,
    jobHuntDataPath,
    myassistMemoryRoot,
    vercel,
    vercelEnv,
    myassistMemoryFile,
    myassistUserStoreFile,
    myassistTaskDayTz,
  };
}

export function assertMyAssistRuntimeEnv(env: EnvSource = process.env): MyAssistRuntimeEnv {
  const runtime = resolveMyAssistRuntimeEnv(env);
  if (!runtime.authSecret) {
    throw new Error("Missing required auth secret: AUTH_SECRET (or NEXTAUTH_SECRET).");
  }
  return runtime;
}
