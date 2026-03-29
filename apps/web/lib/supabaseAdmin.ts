import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";

let cached: SupabaseClient | null = null;
let cachedKey: string | null = null;

/** Same Supabase project URL as other Bookiji apps (Kinetix often uses NEXT_PUBLIC_* or VITE_* only). */
export function resolveSupabaseProjectUrl(): string | undefined {
  return resolveMyAssistRuntimeEnv().supabaseProjectUrl || undefined;
}

/**
 * Server secret for Supabase API (PostgREST). Prefer new project secret (`sb_secret_...`);
 * legacy JWT `service_role` still works if enabled in the dashboard.
 */
export function resolveSupabaseSecretKey(): string | undefined {
  return resolveMyAssistRuntimeEnv().supabaseSecretKey || undefined;
}

/**
 * Supabase admin client (elevated API access). Only for server-side code.
 * When project URL + secret key are set, hosted user + integration storage uses Postgres.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = resolveSupabaseProjectUrl();
  const key = resolveSupabaseSecretKey();
  if (!url || !key) {
    cached = null;
    cachedKey = null;
    return null;
  }
  if (!cached || cachedKey !== `${url}\n${key}`) {
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    cachedKey = `${url}\n${key}`;
  }
  return cached;
}

/** True when project URL + server secret key are set (hosted durable storage). */
export function isSupabaseHostedStorageEnabled(): boolean {
  return Boolean(resolveSupabaseProjectUrl() && resolveSupabaseSecretKey());
}
