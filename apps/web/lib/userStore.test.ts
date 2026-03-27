import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUser, findUserByEmail } from "./userStore";

describe("userStore", () => {
  const originalStoreFile = process.env.MYASSIST_USER_STORE_FILE;
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalNextPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalViteUrl = process.env.VITE_SUPABASE_URL;
  const originalSecretKey = process.env.SUPABASE_SECRET_KEY;
  const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "myassist-users-"));
    process.env.MYASSIST_USER_STORE_FILE = path.join(tempDir, "users.json");
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(async () => {
    if (originalStoreFile === undefined) {
      delete process.env.MYASSIST_USER_STORE_FILE;
    } else {
      process.env.MYASSIST_USER_STORE_FILE = originalStoreFile;
    }
    if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalSupabaseUrl;
    if (originalNextPublicUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalNextPublicUrl;
    if (originalViteUrl === undefined) delete process.env.VITE_SUPABASE_URL;
    else process.env.VITE_SUPABASE_URL = originalViteUrl;
    if (originalSecretKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalSecretKey;
    if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("preserves all concurrent registrations", async () => {
    const seed = randomUUID().slice(0, 8);
    const emails = [
      `concurrent-a-${seed}@example.com`,
      `concurrent-b-${seed}@example.com`,
      `concurrent-c-${seed}@example.com`,
    ];

    await Promise.all(
      emails.map((email, idx) =>
        createUser({
          email,
          password: `testpass-${idx}-123`,
        }),
      ),
    );

    const users = await Promise.all(emails.map((email) => findUserByEmail(email)));
    expect(users.every(Boolean)).toBe(true);
  });
});
