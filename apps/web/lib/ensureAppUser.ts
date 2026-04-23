import "server-only";

import type { User } from "@supabase/supabase-js";
import { MYASSIST_SCHEMA, MYASSIST_APP_USERS_TABLE } from "@/lib/myassistSchema";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { logServerEvent } from "@/lib/serverLog";

export type EnsureAppUserResult =
  | { ok: true }
  | { ok: false; code: "UNAVAILABLE" | "EMAIL_CONFLICT" | "MISSING_EMAIL" | "DB_ERROR" };

function normalizeEmail(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase() ?? "";
  return e.length > 0 ? e : null;
}

/**
 * Idempotent bridge: ensure `myassist.app_users` has a row keyed by Supabase `auth.users.id`.
 * Call only from explicit server paths (e.g. `/auth/callback`), not from session helpers.
 */
export async function ensureAppUser(user: User): Promise<EnsureAppUserResult> {
  const email = normalizeEmail(user.email);
  if (!email) {
    return { ok: false, code: "MISSING_EMAIL" };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, code: "UNAVAILABLE" };
  }

  const id = user.id.trim();

  const { data: byId, error: byIdErr } = await admin
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_APP_USERS_TABLE)
    .select("id, email")
    .eq("id", id)
    .maybeSingle();
  if (byIdErr) {
    logServerEvent("error", "myassist_ensure_app_user_select_id_failed", {
      message: byIdErr.message,
    });
    return { ok: false, code: "DB_ERROR" };
  }

  const now = new Date().toISOString();

  if (byId && typeof (byId as { email?: string }).email === "string") {
    const existingEmail = ((byId as { email: string }).email ?? "").trim().toLowerCase();
    if (existingEmail !== email) {
      const { error: updErr } = await admin
        .schema(MYASSIST_SCHEMA)
        .from(MYASSIST_APP_USERS_TABLE)
        .update({ email, updated_at: now })
        .eq("id", id);
      if (updErr) {
        logServerEvent("error", "myassist_ensure_app_user_update_email_failed", {
          message: updErr.message,
        });
        return { ok: false, code: "DB_ERROR" };
      }
    }
    return { ok: true };
  }

  const { data: byEmail, error: emailErr } = await admin
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_APP_USERS_TABLE)
    .select("id, email")
    .eq("email", email)
    .maybeSingle();

  if (emailErr) {
    logServerEvent("error", "myassist_ensure_app_user_select_email_failed", {
      message: emailErr.message,
    });
    return { ok: false, code: "DB_ERROR" };
  }

  if (byEmail && typeof (byEmail as { id?: string }).id === "string") {
    const otherId = (byEmail as { id: string }).id.trim();
    if (otherId !== id) {
      logServerEvent("error", "myassist_ensure_app_user_email_conflict", {
        authUserId: id,
        existingRowUserId: otherId,
        email,
      });
      return { ok: false, code: "EMAIL_CONFLICT" };
    }
  }

  const { error: insErr } = await admin
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_APP_USERS_TABLE)
    .insert({
      id,
      email,
      password_hash: null,
      created_at: now,
      updated_at: now,
    });

  if (insErr) {
    if (insErr.code === "23505") {
      return { ok: true };
    }
    logServerEvent("error", "myassist_ensure_app_user_insert_failed", {
      message: insErr.message,
      code: insErr.code,
    });
    return { ok: false, code: "DB_ERROR" };
  }

  return { ok: true };
}
