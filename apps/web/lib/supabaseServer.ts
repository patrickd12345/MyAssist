import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";

function resolveServerSupabaseUrl(): string {
  return resolveMyAssistRuntimeEnv().supabaseProjectUrl;
}

function resolveServerSupabaseAnonKey(): string {
  const runtime = resolveMyAssistRuntimeEnv();
  return runtime.supabaseAnonKey || "";
}

export async function getSupabaseServerClient(): Promise<SupabaseClient | null> {
  const url = resolveServerSupabaseUrl();
  const anon = resolveServerSupabaseAnonKey();
  if (!url || !anon) return null;

  const cookieStore = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const c of cookiesToSet) {
            cookieStore.set(c.name, c.value, c.options as CookieOptions);
          }
        } catch {
          // No-op in read-only contexts (server components).
        }
      },
    },
  });
}

function isStaleSessionAuthError(err: { message?: string; code?: string; name?: string }): boolean {
  const c = err.code ?? "";
  if (c === "refresh_token_not_found" || c === "invalid_refresh_token") return true;
  const m = typeof err.message === "string" ? err.message.toLowerCase() : "";
  return m.includes("refresh token") && (m.includes("not found") || m.includes("invalid"));
}

export async function getSupabaseServerUser(): Promise<User | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    // Stale or cross-project cookies: clear session so the next request does not re-hit refresh and spam the console.
    if (isStaleSessionAuthError(error)) {
      try {
        await supabase.auth.signOut();
      } catch {
        // non-fatal; cookies may be read-only in some RSC contexts
      }
    }
    return null;
  }
  return data.user ?? null;
}
