import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { hash } from "bcryptjs";
import type { SafeUser, StoredUser } from "./userStoreTypes";

type UserRegistryFile = {
  users: StoredUser[];
};

const SALT_ROUNDS = 12;
const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 1000 * 60 * 30;
const USER_STORE_LOCK_TIMEOUT_MS = 10_000;
const USER_STORE_LOCK_RETRY_MS = 25;

function registryPath(): string {
  const override = process.env.MYASSIST_USER_STORE_FILE?.trim();
  if (override) return path.resolve(override);
  return path.join(process.cwd(), ".myassist-memory", "users.json");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function readRegistry(): Promise<UserRegistryFile> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await readFile(registryPath(), "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return { users: [] };
      const u = parsed as Partial<UserRegistryFile>;
      if (!Array.isArray(u.users)) return { users: [] };
      const users = u.users.filter((row): row is StoredUser => {
        if (!row || typeof row !== "object") return false;
        const r = row as Partial<StoredUser>;
        return (
          typeof r.id === "string" &&
          typeof r.email === "string" &&
          typeof r.passwordHash === "string"
        );
      });
      return { users };
    } catch {
      if (attempt === 0) {
        await waitForLockRetry();
        continue;
      }
      return { users: [] };
    }
  }
  return { users: [] };
}

async function writeRegistry(data: UserRegistryFile): Promise<void> {
  const file = registryPath();
  const dir = path.dirname(file);
  await mkdir(dir, { recursive: true });
  const temp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temp, JSON.stringify(data, null, 2), "utf8");
  try {
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
}

async function waitForLockRetry(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, USER_STORE_LOCK_RETRY_MS));
}

async function withRegistryLock<T>(work: () => Promise<T>): Promise<T> {
  const file = registryPath();
  const lockPath = `${file}.lock`;
  const start = Date.now();

  while (true) {
    try {
      const handle = await open(lockPath, "wx");
      try {
        return await work();
      } finally {
        await handle.close();
        await rm(lockPath, { force: true });
      }
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? (error as { code?: string }).code : "";
      if (code !== "EEXIST") {
        throw error;
      }
      if (Date.now() - start >= USER_STORE_LOCK_TIMEOUT_MS) {
        throw new Error("USER_STORE_LOCK_TIMEOUT");
      }
      await waitForLockRetry();
    }
  }
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const key = normalizeEmail(email);
  const { users } = await readRegistry();
  return users.find((u) => normalizeEmail(u.email) === key) ?? null;
}

export async function getUserById(id: string): Promise<SafeUser | null> {
  const trimmed = id.trim();
  if (!trimmed) return null;
  const { users } = await readRegistry();
  const found = users.find((u) => u.id === trimmed);
  if (!found) return null;
  return {
    id: found.id,
    email: found.email,
    todoistApiToken: found.todoistApiToken,
  };
}

export async function createUser(input: { email: string; password: string }): Promise<SafeUser> {
  const email = normalizeEmail(input.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("INVALID_INPUT");
  }
  const password = input.password;
  if (typeof password !== "string" || password.length < 8 || password.length > 256) {
    throw new Error("INVALID_INPUT");
  }

  return withRegistryLock(async () => {
    const registry = await readRegistry();
    if (registry.users.some((u) => normalizeEmail(u.email) === email)) {
      throw new Error("DUPLICATE");
    }

    const passwordHash = await hash(password, SALT_ROUNDS);
    const user: StoredUser = {
      id: randomUUID(),
      email,
      passwordHash,
    };
    registry.users.push(user);
    await writeRegistry(registry);

    return {
      id: user.id,
      email: user.email,
      todoistApiToken: user.todoistApiToken,
    };
  });
}

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPasswordResetToken(email: string): Promise<string | null> {
  const key = normalizeEmail(email);
  if (!key) return null;
  return withRegistryLock(async () => {
    const registry = await readRegistry();
    const idx = registry.users.findIndex((u) => normalizeEmail(u.email) === key);
    if (idx < 0) return null;

    const rawToken = randomBytes(RESET_TOKEN_BYTES).toString("hex");
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
    registry.users[idx] = {
      ...registry.users[idx],
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: expiresAt,
    };
    await writeRegistry(registry);
    return rawToken;
  });
}

export async function resetPasswordWithToken(input: { token: string; password: string }): Promise<boolean> {
  const token = input.token.trim();
  const password = input.password;
  if (!token) return false;
  if (typeof password !== "string" || password.length < 8 || password.length > 256) return false;

  return withRegistryLock(async () => {
    const tokenHash = hashResetToken(token);
    const now = Date.now();
    const registry = await readRegistry();
    const idx = registry.users.findIndex((u) => {
      if (!u.passwordResetTokenHash || !u.passwordResetExpiresAt) return false;
      const exp = Date.parse(u.passwordResetExpiresAt);
      if (!Number.isFinite(exp) || exp < now) return false;
      return u.passwordResetTokenHash === tokenHash;
    });
    if (idx < 0) return false;

    const passwordHash = await hash(password, SALT_ROUNDS);
    registry.users[idx] = {
      ...registry.users[idx],
      passwordHash,
      passwordResetTokenHash: undefined,
      passwordResetExpiresAt: undefined,
    };
    await writeRegistry(registry);
    return true;
  });
}
