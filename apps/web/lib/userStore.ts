import { isSupabaseHostedStorageEnabled } from "./supabaseAdmin";
import type { SafeUser, StoredUser } from "./userStoreTypes";
import * as file from "./userStoreFile";
import * as hosted from "./userStoreSupabase";

export type { SafeUser, StoredUser } from "./userStoreTypes";

function impl() {
  return isSupabaseHostedStorageEnabled() ? hosted : file;
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  return impl().findUserByEmail(email);
}

export async function getUserById(id: string): Promise<SafeUser | null> {
  return impl().getUserById(id);
}

export async function createUser(input: { email: string; password: string }): Promise<SafeUser> {
  return impl().createUser(input);
}
