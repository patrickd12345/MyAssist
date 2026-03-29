import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { resetPasswordWithToken } from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { token?: unknown; password?: unknown };
    const token = typeof body.token === "string" ? body.token : "";
    const password = typeof body.password === "string" ? body.password : "";
    const ok = await resetPasswordWithToken({ token, password });
    if (!ok) {
      return jsonLegacyApiError("Invalid or expired reset link.", 400);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return jsonLegacyApiError("Could not reset password.", 400);
  }
}
