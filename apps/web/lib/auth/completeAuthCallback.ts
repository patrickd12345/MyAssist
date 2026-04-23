import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ensureAppUser } from "@/lib/ensureAppUser";
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";
import { resolveMyAssistSiteOriginForRequest } from "@/lib/myassistSiteOrigin";
import { safeInternalPath } from "@/lib/safeInternalPath";

function resolveServerSupabaseUrl(): string {
  return resolveMyAssistRuntimeEnv().supabaseProjectUrl;
}

function resolveServerSupabaseAnonKey(): string {
  const runtime = resolveMyAssistRuntimeEnv();
  return runtime.supabaseAnonKey || "";
}

function signInWithError(origin: string, error: string, resumePath: string): NextResponse {
  const u = new URL("/sign-in", origin);
  u.searchParams.set("error", error);
  if (resumePath && resumePath !== "/") {
    u.searchParams.set("callbackUrl", resumePath);
  }
  return NextResponse.redirect(u);
}

/**
 * Supabase PKCE return handler: run from `app/auth/callback/route.ts` GET only (Route Handler; cookie writes are reliable there).
 */
export async function runAuthCallbackGet(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("callbackUrl") ?? url.searchParams.get("next");
  const destination = safeInternalPath(rawNext);
  const resumePath = destination;
  const origin = resolveMyAssistSiteOriginForRequest(request);

  if (!code) {
    return signInWithError(origin, "missing_code", resumePath);
  }

  const supabaseUrl = resolveServerSupabaseUrl();
  const supabaseAnonKey = resolveServerSupabaseAnonKey();
  if (!supabaseUrl || !supabaseAnonKey) {
    return signInWithError(origin, "auth_unavailable", resumePath);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const c of cookiesToSet) {
          cookieStore.set(c.name, c.value, c.options as CookieOptions);
        }
      },
    },
  });

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return signInWithError(origin, "exchange_failed", resumePath);
  }

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return signInWithError(origin, "session_failed", resumePath);
  }

  const bridge = await ensureAppUser(user);
  if (!bridge.ok) {
    if (bridge.code === "EMAIL_CONFLICT") {
      return signInWithError(origin, "account_link", resumePath);
    }
    return signInWithError(origin, "bridge_failed", resumePath);
  }

  return NextResponse.redirect(`${origin}${destination}`);
}
