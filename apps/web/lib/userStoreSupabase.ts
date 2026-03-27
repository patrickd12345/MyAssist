import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { getSupabaseAdmin } from "./supabaseAdmin";
import {
  MYASSIST_APP_USERS_TABLE,
  MYASSIST_SCHEMA,
} from "./myassistSchema";
import type { SafeUser, StoredUser } from "./userStoreTypes";

const SALT_ROUNDS = 12;
const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 1000 * 60 * 30;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function rowToStoredUser(row: Record<string, unknown>): StoredUser | null {
  if (
    typeof row.id !== "string" ||
    typeof row.email !== "string" ||
    typeof row.password_hash !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    todoistApiToken: typeof row.todoist_api_token === "string" ? row.todoist_api_token : undefined,
    passwordResetTokenHash:
      typeof row.password_reset_token_hash === "string" ? row.password_reset_token_hash : undefined,
    passwordResetExpiresAt:
      typeof row.password_reset_expires_at === "string"
        ? row.password_reset_expires_at
        : row.password_reset_expires_at instanceof Date
          ? row.password_reset_expires_at.toISOString()
          : undefined,
  };
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const key = normalizeEmail(email);
  const { data, error } = await supabase
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_APP_USERS_TABLE)
    .select(
      "id, email, password_hash, todoist_api_token, password_reset_token_hash, password_reset_expires_at",
    )
    .eq("email", key)
    .maybeSingle();
  if (error || !data) return null;
  return rowToStoredUser(data as Record<string, unknown>);
}

export async function getUserById(id: string): Promise<SafeUser | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_APP_USERS_TABLE)
    .select("id, email, todoist_api_token")
    .eq("id", trimmed)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.email !== "string") return null;
  return {
    id: row.id,
    email: row.email,
    todoistApiToken: typeof row.todoist_api_token === "string" ? row.todoist_api_token : undefined,
  };
}

export async function createUser(input: { email: string; password: string }): Promise<SafeUser> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("SUPABASE_UNAVAILABLE");

  const email = normalizeEmail(input.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("INVALID_INPUT");
  }
  const password = input.password;
  if (typeof password !== "string" || password.length < 8 || password.length > 256) {
    throw new Error("INVALID_INPUT");
  }

  const passwordHash = await hash(password, SALT_ROUNDS);
  const id = randomUUID();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_APP_USERS_TABLE)
    .insert({
      id,
      email,
      password_hash: passwordHash,
      created_at: now,
      updated_at: now,
    })
    .select("id, email, todoist_api_token")
    .single();

  if (error) {
    if (error.code === "23505" || /duplicate key|unique constraint/i.test(error.message)) {
      throw new Error("DUPLICATE");
    }
    throw new Error(error.message);
  }
  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    email: row.email as string,
    todoistApiToken: typeof row.todoist_api_token === "string" ? row.todoist_api_token : undefined,
  };
}

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPasswordResetToken(email: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const key = normalizeEmail(email);
  if (!key) return null;

  const { data: existing, error: findErr } = await supabase
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_APP_USERS_TABLE)
    .select("id")
    .eq("email", key)
    .maybeSingle();
  if (findErr || !existing) return null;

  const rawToken = randomBytes(RESET_TOKEN_BYTES).toString("hex");
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

  const { error: updateErr } = await supabase
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_APP_USERS_TABLE)
    .update({
      password_reset_token_hash: tokenHash,
      password_reset_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("email", key);

  if (updateErr) return null;
  return rawToken;
}

export async function resetPasswordWithToken(input: { token: string; password: string }): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const token = input.token.trim();
  const password = input.password;
  if (!token) return false;
  if (typeof password !== "string" || password.length < 8 || password.length > 256) return false;

  const tokenHash = hashResetToken(token);
  const nowIso = new Date().toISOString();

  const { data: row, error: findErr } = await supabase
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_APP_USERS_TABLE)
    .select("id, password_reset_expires_at")
    .eq("password_reset_token_hash", tokenHash)
    .maybeSingle();
  if (findErr || !row) return false;

  const rec = row as Record<string, unknown>;
  const expRaw = rec.password_reset_expires_at;
  const expStr =
    typeof expRaw === "string" ? expRaw : expRaw instanceof Date ? expRaw.toISOString() : null;
  if (!expStr || Date.parse(expStr) < Date.now()) return false;

  const passwordHash = await hash(password, SALT_ROUNDS);
  const { error: updateErr } = await supabase
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_APP_USERS_TABLE)
    .update({
      password_hash: passwordHash,
      password_reset_token_hash: null,
      password_reset_expires_at: null,
      updated_at: nowIso,
    })
    .eq("id", rec.id as string);

  return !updateErr;
}
