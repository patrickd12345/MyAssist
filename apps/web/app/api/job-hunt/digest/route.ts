import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import {
  isMyAssistProductionLikeEnv,
  resolveMyAssistRuntimeEnv,
} from "@/lib/env/runtime";
import { isLocalhostServiceUrl } from "@/lib/env/urlGuards";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const DEFAULT_DIGEST_URL = "http://127.0.0.1:3847/digest";

function resolveDigestUrl(): string {
  const runtime = resolveMyAssistRuntimeEnv();
  const configured = runtime.jobHuntDigestUrl;
  if (!isMyAssistProductionLikeEnv()) {
    return configured || DEFAULT_DIGEST_URL;
  }
  if (!configured) {
    throw new Error("JOB_HUNT_DIGEST_URL is required in production.");
  }
  if (isLocalhostServiceUrl(configured)) {
    throw new Error("JOB_HUNT_DIGEST_URL must not point at localhost in production.");
  }
  return configured;
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return jsonLegacyApiError("Unauthorized", 401);
  }

  let digestUrl: string;
  try {
    digestUrl = resolveDigestUrl();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid JobHunt digest URL";
    return NextResponse.json({ ok: false as const, error: message }, { status: 500 });
  }

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
      return jsonLegacyApiError(`Digest server returned HTTP ${res.status}`, 502);
    }

    const digest = (await res.json()) as Record<string, unknown>;
    return NextResponse.json({ ok: true as const, digestUrl, digest });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonLegacyApiError(message, 500);
  }
}
