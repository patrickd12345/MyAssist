import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { integrationService } from "@/lib/integrations/service";
import { resolvePublicOrigin } from "@/lib/integrations/origin";
import { verifyGoogleOAuthState } from "@/lib/integrations/oauthState";
import { logServerEvent } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

function googleOAuthRedirectUri(origin: string): string {
  return `${origin}/api/integrations/google/callback`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = resolvePublicOrigin(req);
  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const err = url.searchParams.get("error")?.trim();
  const redirectUriForExchange = googleOAuthRedirectUri(origin);
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

    const isFkError = error instanceof Error && error.message.includes("violates foreign key constraint");
    if (isFkError) {
      return NextResponse.redirect(`${origin}/?integrations=error&reason=user_not_found`);
    }

    return NextResponse.redirect(`${origin}/?integrations=error`);
  }
}
