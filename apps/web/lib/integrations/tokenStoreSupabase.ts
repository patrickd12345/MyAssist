import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  MYASSIST_INTEGRATION_TOKENS_TABLE,
  MYASSIST_SCHEMA,
} from "@/lib/myassistSchema";
import { logServerEvent } from "@/lib/serverLog";
import { decryptJson, encryptJson } from "./crypto";
import type { IntegrationProvider, IntegrationTokenPayload } from "./types";

function parseUserUuid(userId: string): string | null {
  const t = userId.trim();
  if (!t) return null;
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRe.test(t) ? t : null;
}

export async function upsertIntegrationToken(
  userId: string,
  provider: IntegrationProvider,
  payload: IntegrationTokenPayload,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("SUPABASE_UNAVAILABLE");
  const uid = parseUserUuid(userId);
  if (!uid) throw new Error("INVALID_USER_ID_FOR_HOSTED_STORE");

  const now = new Date().toISOString();
  const encrypted_payload = encryptJson(payload);
  const scopes = typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [];

  const { data: existingRows } = await supabase
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_INTEGRATION_TOKENS_TABLE)
    .select("connected_at, refresh_last_used_at")
    .eq("user_id", uid)
    .eq("provider", provider)
    .maybeSingle();

  const existing = existingRows as { connected_at?: string; refresh_last_used_at?: string | null } | null;
  const connected_at = existing?.connected_at ?? now;
  const refresh_last_used_at = existing?.refresh_last_used_at ?? null;

  const { error } = await supabase
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_INTEGRATION_TOKENS_TABLE)
    .upsert(
    {
      user_id: uid,
      provider,
      status: "connected",
      encrypted_payload,
      scopes,
      connected_at,
      updated_at: now,
      refresh_last_used_at,
      revoked_at: null,
    },
    { onConflict: "user_id,provider" },
  );

  if (error) throw new Error(error.message);
}

export async function getIntegrationToken(
  userId: string,
  provider: IntegrationProvider,
): Promise<IntegrationTokenPayload | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const uid = parseUserUuid(userId);
  if (!uid) return null;

  const { data, error } = await supabase
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_INTEGRATION_TOKENS_TABLE)
    .select("encrypted_payload, status")
    .eq("user_id", uid)
    .eq("provider", provider)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as { encrypted_payload?: string; status?: string };
  if (row.status !== "connected" || typeof row.encrypted_payload !== "string") return null;
  try {
    return decryptJson<IntegrationTokenPayload>(row.encrypted_payload);
  } catch {
    logServerEvent("warn", "myassist_integrations_token_decrypt_failed", { provider, store: "supabase" });
    return null;
  }
}

export async function markIntegrationRefreshUsed(
  userId: string,
  provider: IntegrationProvider,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const uid = parseUserUuid(userId);
  if (!uid) return;
  const now = new Date().toISOString();
  await supabase
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_INTEGRATION_TOKENS_TABLE)
    .update({ refresh_last_used_at: now, updated_at: now })
    .eq("user_id", uid)
    .eq("provider", provider)
    .eq("status", "connected");
}

export async function revokeIntegration(userId: string, provider: IntegrationProvider): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const uid = parseUserUuid(userId);
  if (!uid) return;
  const now = new Date().toISOString();
  await supabase
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_INTEGRATION_TOKENS_TABLE)
    .update({ status: "revoked", revoked_at: now, updated_at: now })
    .eq("user_id", uid)
    .eq("provider", provider);
}

export async function listIntegrationStatuses(userId: string): Promise<
  Array<{ provider: IntegrationProvider; status: "connected" | "revoked" | "disconnected"; updated_at?: string }>
> {
  const supabase = getSupabaseAdmin();
  const providers: IntegrationProvider[] = ["gmail", "todoist", "google_calendar"];
  if (!supabase) {
    return providers.map((provider) => ({ provider, status: "disconnected" as const }));
  }
  const uid = parseUserUuid(userId);
  if (!uid) {
    return providers.map((provider) => ({ provider, status: "disconnected" as const }));
  }

  const { data, error } = await supabase
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_INTEGRATION_TOKENS_TABLE)
    .select("provider, status, updated_at")
    .eq("user_id", uid);

  if (error || !Array.isArray(data)) {
    return providers.map((provider) => ({ provider, status: "disconnected" as const }));
  }

  const rows = data as Array<{
    provider: IntegrationProvider;
    status: "connected" | "revoked";
    updated_at: string;
  }>;
  return providers.map((provider) => {
    const row = rows.find((x) => x.provider === provider);
    if (!row) return { provider, status: "disconnected" as const };
    return { provider, status: row.status, updated_at: row.updated_at };
  });
}
