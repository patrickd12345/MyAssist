import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const DEFAULT_DIGEST_URL = "http://127.0.0.1:3847/digest";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return jsonLegacyApiError("Unauthorized", 401);
  }

  const digestUrl = resolveMyAssistRuntimeEnv().jobHuntDigestUrl || DEFAULT_DIGEST_URL;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(digestUrl, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);

    if (!res.ok) {
      return NextResponse.json({
        ok: false as const,
        digestUrl,
        error: `Digest server returned HTTP ${res.status}`,
      });
    }

    const digest = (await res.json()) as Record<string, unknown>;
    return NextResponse.json({ ok: true as const, digestUrl, digest });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      ok: false as const,
      digestUrl,
      error: message,
    });
  }
}
