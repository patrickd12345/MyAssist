import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { getSupabaseAuthClient } from "@/lib/supabaseAuth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { code?: unknown; password?: unknown };
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!code) {
      return jsonLegacyApiError("Invalid or expired reset link.", 400);
    }

    if (password.length < 8 || password.length > 256) {
      return jsonLegacyApiError("Password must be at least 8 characters.", 400);
    }

    const supabase = getSupabaseAuthClient();
    if (!supabase) {
      return jsonLegacyApiError("Invalid or expired reset link.", 400);
    }

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      return jsonLegacyApiError("Invalid or expired reset link.", 400);
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      return jsonLegacyApiError("Could not reset password.", 400);
    }

    await supabase.auth.signOut();
    return NextResponse.json({ ok: true });
  } catch {
    return jsonLegacyApiError("Could not reset password.", 400);
  }
}
