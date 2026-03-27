import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getIntegrationToken,
  upsertIntegrationToken,
} from "./integrations/tokenStore";
import { createUser, findUserByEmail, getUserById } from "./userStore";

/**
 * End-to-end file fallback: no Supabase env, real user + integration token round-trips.
 * Mirrors "smoke test local fallback" from production checklist.
 */
describe("storage fallback smoke (file-backed, no Supabase)", () => {
  const originalCwd = process.cwd();
  const originalUserFile = process.env.MYASSIST_USER_STORE_FILE;
  const originalUrl = process.env.SUPABASE_URL;
  const originalNextPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalViteUrl = process.env.VITE_SUPABASE_URL;
  const originalSecretKey = process.env.SUPABASE_SECRET_KEY;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "myassist-fallback-smoke-"));
    process.chdir(tempRoot);
    process.env.MYASSIST_USER_STORE_FILE = path.join(tempRoot, "users.json");
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalUserFile === undefined) delete process.env.MYASSIST_USER_STORE_FILE;
    else process.env.MYASSIST_USER_STORE_FILE = originalUserFile;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalNextPublicUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalNextPublicUrl;
    if (originalViteUrl === undefined) delete process.env.VITE_SUPABASE_URL;
    else process.env.VITE_SUPABASE_URL = originalViteUrl;
    if (originalSecretKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalSecretKey;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("create user, fetch user, store and fetch integration token", async () => {
    const email = `smoke-${Date.now()}@example.com`;
    const password = "smoke-pass-123456";
    const created = await createUser({ email, password });
    expect(created.id).toBeTruthy();
    expect(created.email).toBe(email);

    const byEmail = await findUserByEmail(email);
    expect(byEmail?.id).toBe(created.id);

    const byId = await getUserById(created.id);
    expect(byId?.email).toBe(email);

    await upsertIntegrationToken(created.id, "todoist", {
      access_token: "smoke-token",
      token_type: "Bearer",
    });
    const tok = await getIntegrationToken(created.id, "todoist");
    expect(tok?.access_token).toBe("smoke-token");
  });
});
