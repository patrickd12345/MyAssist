import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { integrationService } from "@/lib/integrations/service";
import { oauthDebugLog } from "@/lib/integrations/oauthDebugLog";
import { resolvePublicOrigin } from "@/lib/integrations/origin";
import { verifyGoogleOAuthState } from "@/lib/integrations/oauthState";
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";
import { logServerEvent } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

function googleOAuthRedirectUri(origin: string): string {
  return `${origin}/api/integrations/google/callback`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawRequestOrigin = new URL(req.url).origin;
  const origin = resolvePublicOrigin(req);
  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const err = url.searchParams.get("error")?.trim();
  const redirectUriForExchange = googleOAuthRedirectUri(origin);
  // #region agent log
  oauthDebugLog({
    hypothesisId: "H1-H4",
    location: "google/callback/route.ts:entry",
    message: "OAuth callback (Google) before exchange",
    data: {
      requestUrl: req.url,
      rawRequestOrigin,
      resolvedOrigin: origin,
      redirectUriForExchange,
      oauthError: err ?? null,
      hasCode: Boolean(code),
      hasState: Boolean(state),
      forwardedHost: req.headers.get("x-forwarded-host") ?? null,
      forwardedProto: req.headers.get("x-forwarded-proto") ?? null,
      nodeEnv: resolveMyAssistRuntimeEnv().nodeEnv,
    },
  });
  // #endregion
  if (err) return NextResponse.redirect(`${origin}/?integrations=error`);
  if (!code || !state) return jsonLegacyApiError("Missing OAuth code/state", 400);

  try {
    const { userId, provider } = verifyGoogleOAuthState(state);
    await integrationService.exchangeGoogleAndStore({
      userId,
      provider,
      code,
      redirectUri: redirectUriForExchange,
    });
    return NextResponse.redirect(`${origin}/?integrations=connected&provider=${provider}`);
  } catch (error) {
    logServerEvent("error", "myassist_google_callback_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.redirect(`${origin}/?integrations=error`);
  }
}
