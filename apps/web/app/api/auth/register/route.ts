import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import {
  checkRegisterRateLimit,
  clientIpFromRequest,
} from "@/lib/registerRateLimit";
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";
import { buildMyAssistAuthCallbackUrlForRequest } from "@/lib/myassistSiteOrigin";
import { getSupabaseAuthClient } from "@/lib/supabaseAuth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ipLimit = checkRegisterRateLimit(clientIpFromRequest(req));
    if (!ipLimit.ok) {
      return jsonLegacyApiError("Too many requests. Try again later.", 429, {
        headers: { "Retry-After": String(ipLimit.retryAfterSec) },
      });
    }

    const body = (await req.json()) as {
      email?: unknown;
      password?: unknown;
      inviteCode?: unknown;
      /** Post-confirm path; hardened via `safeInternalPath` in `buildMyAssistAuthCallbackUrlForRequest`. */
      callbackUrl?: unknown;
    };
    const expectedInvite = resolveMyAssistRuntimeEnv().registrationInviteCode;
    if (expectedInvite) {
      const code = typeof body.inviteCode === "string" ? body.inviteCode.trim() : "";
      if (code !== expectedInvite) {
        return jsonLegacyApiError("Could not complete registration.", 400);
      }
    }

    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";
    const supabase = getSupabaseAuthClient();
    if (!supabase) {
      return jsonLegacyApiError("Could not complete registration.", 400);
    }
    const emailRedirectTo = buildMyAssistAuthCallbackUrlForRequest(
      req,
      typeof body.callbackUrl === "string" ? body.callbackUrl : null,
    );
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo },
    });
    if (error) {
      return jsonLegacyApiError("Could not complete registration.", 400);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return jsonLegacyApiError("Could not complete registration.", 400);
  }
}
