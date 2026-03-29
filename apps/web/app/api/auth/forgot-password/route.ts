import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";
import { createPasswordResetToken } from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email) {
      return jsonLegacyApiError("Email is required.", 400);
    }

    const token = await createPasswordResetToken(email);
    const response: Record<string, unknown> = { ok: true };
    const runtime = resolveMyAssistRuntimeEnv();
    if (token && runtime.nodeEnv !== "production") {
      const base = runtime.authUrl || runtime.nextAuthUrl || "http://localhost:3000";
      response.devResetUrl = `${base.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
    } else if (!token && runtime.nodeEnv !== "production") {
      response.devHint = "No local account found for this email. Use Register first, then reset if needed.";
    }
    // Always return success to avoid account enumeration.
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ ok: true });
  }
}
