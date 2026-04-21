import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey: string | null = null;

export function resolveSupabaseAuthKey(): string | undefined {
  const runtime = resolveMyAssistRuntimeEnv();
  return runtime.supabaseAnonKey || runtime.supabaseSecretKey || undefined;
}

export function getSupabaseAuthClient(): SupabaseClient | null {
  const runtime = resolveMyAssistRuntimeEnv();
  const url = runtime.supabaseProjectUrl || "";
  const key = resolveSupabaseAuthKey() || "";

  if (!url || !key) {
    cachedClient = null;
    cachedConfigKey = null;
    return null;
  }

  const configKey = `${url}\n${key}`;
  if (!cachedClient || cachedConfigKey !== configKey) {
    cachedClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    cachedConfigKey = configKey;
  }

  return cachedClient;
}
