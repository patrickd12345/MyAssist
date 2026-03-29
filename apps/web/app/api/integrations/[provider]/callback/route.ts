import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { integrationService } from "@/lib/integrations/service";
import { resolvePublicOrigin } from "@/lib/integrations/origin";
import { verifyOAuthState } from "@/lib/integrations/oauthState";
import { exchangeTodoistCode } from "@/lib/integrations/providers/todoist";
import { logServerEvent } from "@/lib/serverLog";
import type { IntegrationProvider } from "@/lib/integrations/types";

export const dynamic = "force-dynamic";

function callbackUrl(origin: string, provider: IntegrationProvider): string {
  return `${origin}/api/integrations/${provider}/callback`;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: IntegrationProvider }> },
) {
  const { provider } = await params;
  const url = new URL(req.url);
  const origin = resolvePublicOrigin(req);
  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const err = url.searchParams.get("error")?.trim();
  if (err) return NextResponse.redirect(`${origin}/?integrations=error`);
  if (!code || !state) return jsonLegacyApiError("Missing OAuth code/state", 400);

  try {
    const { userId } = verifyOAuthState(state, provider);
    if (provider === "gmail" || provider === "google_calendar") {
      await integrationService.exchangeGoogleAndStore({
        userId,
        provider,
        code,
        redirectUri: callbackUrl(origin, provider),
      });
    } else if (provider === "todoist") {
      const token = await exchangeTodoistCode({
        code,
        redirectUri: callbackUrl(origin, provider),
      });
      await integrationService.storeToken(userId, provider, token);
    } else {
      return jsonLegacyApiError("Unsupported provider", 400);
    }
    return NextResponse.redirect(`${origin}/?integrations=connected&provider=${provider}`);
  } catch (error) {
    logServerEvent("error", "integrations_callback_failed", {
      provider,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.redirect(`${origin}/?integrations=error&provider=${provider}`);
  }
}
