import "server-only";

import { isSupabaseHostedStorageEnabled } from "@/lib/supabaseAdmin";
import type { IntegrationProvider, IntegrationTokenPayload } from "./types";
import * as file from "./tokenStoreFile";
import * as hosted from "./tokenStoreSupabase";

function impl() {
  return isSupabaseHostedStorageEnabled() ? hosted : file;
}

export async function upsertIntegrationToken(
  userId: string,
  provider: IntegrationProvider,
  payload: IntegrationTokenPayload,
): Promise<void> {
  return impl().upsertIntegrationToken(userId, provider, payload);
}

export async function getIntegrationToken(
  userId: string,
  provider: IntegrationProvider,
): Promise<IntegrationTokenPayload | null> {
  return impl().getIntegrationToken(userId, provider);
}

export async function markIntegrationRefreshUsed(
  userId: string,
  provider: IntegrationProvider,
): Promise<void> {
  return impl().markIntegrationRefreshUsed(userId, provider);
}

export async function revokeIntegration(userId: string, provider: IntegrationProvider): Promise<void> {
  return impl().revokeIntegration(userId, provider);
}

export async function listIntegrationStatuses(userId: string): Promise<
  Array<{ provider: IntegrationProvider; status: "connected" | "revoked" | "disconnected"; updated_at?: string }>
> {
  return impl().listIntegrationStatuses(userId);
}
