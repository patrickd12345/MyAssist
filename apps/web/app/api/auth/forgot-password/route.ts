import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";
import { getSupabaseAuthClient } from "@/lib/supabaseAuth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email) {
      return jsonLegacyApiError("Email is required.", 400);
    }

    const supabase = getSupabaseAuthClient();
    const runtime = resolveMyAssistRuntimeEnv();
    const requestOrigin = new URL(req.url).origin;
    const base = runtime.publicAppUrl || runtime.authUrl || runtime.nextAuthUrl || requestOrigin;
    const redirectTo = `${base.replace(/\/$/, "")}/reset-password`;

    if (supabase) {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
