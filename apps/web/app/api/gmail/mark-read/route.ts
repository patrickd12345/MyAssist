import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";
import { integrationService } from "@/lib/integrations/service";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

type MarkReadPayload = {
  messageId?: string;
  threadId?: string;
  /** When true, adds UNREAD instead of removing it (same endpoint for Gmail read state). */
  unread?: boolean;
};

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return jsonLegacyApiError("Unauthorized", 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
  }

  const payload = body as MarkReadPayload;
  const messageId = typeof payload.messageId === "string" ? payload.messageId.trim() : "";
  const threadId = typeof payload.threadId === "string" ? payload.threadId.trim() : "";
  const unread = payload.unread === true;
  if (!messageId && !threadId) {
    return NextResponse.json(
      { ok: false, error: "messageId or threadId is required" },
      { status: 400 },
    );
  }

  try {
    if (unread) {
      const direct = await integrationService.markEmailUnread(userId, { messageId, threadId });
      if (direct.ok) return NextResponse.json({ ok: true, mode: "oauth" });
      return NextResponse.json(
        {
          ok: false,
          error: "Gmail is disconnected or mark-unread failed. Connect Gmail integration.",
        },
        { status: 409 },
      );
    }

    const direct = await integrationService.markEmailRead(userId, { messageId, threadId });
    if (direct.ok) return NextResponse.json({ ok: true, mode: "oauth" });

    const webhook = resolveMyAssistRuntimeEnv().gmailMarkReadWebhookUrl;
    if (!webhook) {
      return NextResponse.json(
        {
          ok: false,
          error: "Gmail is disconnected. Connect Gmail integration or configure webhook fallback.",
        },
        { status: 409 },
      );
    }

    const upstream = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        userId,
        ...(messageId ? { messageId } : {}),
        ...(threadId ? { threadId } : {}),
      }),
      cache: "no-store",
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return NextResponse.json(
        {
          ok: false,
          error: `mark-read webhook failed (${upstream.status})`,
          details: text.slice(0, 400),
        },
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const json = (await upstream.json()) as Record<string, unknown>;
      return NextResponse.json({ ok: true, upstream: json });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
