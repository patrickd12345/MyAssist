import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;
let cachedKey: string | null = null;

/** Same Supabase project URL as other Bookiji apps (Kinetix often uses NEXT_PUBLIC_* or VITE_* only). */
export function resolveSupabaseProjectUrl(): string | undefined {
  return (
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    undefined
  );
}

/**
 * Server secret for Supabase API (PostgREST). Prefer new project secret (`sb_secret_...`);
 * legacy JWT `service_role` still works if enabled in the dashboard.
 */
export function resolveSupabaseSecretKey(): string | undefined {
  return (
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    undefined
  );
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
