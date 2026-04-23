import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { getSupabaseAdmin } from "./supabaseAdmin";
import {
  MYASSIST_APP_USERS_TABLE,
  MYASSIST_SCHEMA,
} from "./myassistSchema";
import type { SafeUser, StoredUser } from "./userStoreTypes";

const SALT_ROUNDS = 12;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function rowToStoredUser(row: Record<string, unknown>): StoredUser | null {
  if (typeof row.id !== "string" || typeof row.email !== "string") {
    return null;
  }
  const ph = row.password_hash;
  if (ph !== null && typeof ph !== "string") {
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    passwordHash: typeof ph === "string" ? ph : "",
    todoistApiToken: typeof row.todoist_api_token === "string" ? row.todoist_api_token : undefined,
  };
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const key = normalizeEmail(email);
  const { data, error } = await supabase
    .schema(MYASSIST_SCHEMA)
    .from(MYASSIST_APP_USERS_TABLE)
    .select("id, email, password_hash, todoist_api_token")
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

