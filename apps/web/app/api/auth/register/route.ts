import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import {
  checkRegisterRateLimit,
  clientIpFromRequest,
} from "@/lib/registerRateLimit";
import { createUser } from "@/lib/userStore";
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";

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
    await createUser({ email, password });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && (error.message === "DUPLICATE" || error.message === "INVALID_INPUT")) {
      return jsonLegacyApiError("Could not complete registration.", 400);
    }
    return jsonLegacyApiError("Could not complete registration.", 400);
  }
}
