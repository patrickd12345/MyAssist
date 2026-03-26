import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { hash } from "bcryptjs";

export type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  n8nWebhookUrl?: string;
  n8nWebhookToken?: string;
  todoistApiToken?: string;
};

export type SafeUser = Omit<StoredUser, "passwordHash">;

type UserRegistryFile = {
  users: StoredUser[];
};

const SALT_ROUNDS = 12;

function registryPath(): string {
  const override = process.env.MYASSIST_USER_STORE_FILE?.trim();
  if (override) return path.resolve(override);
  return path.join(process.cwd(), ".myassist-memory", "users.json");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function readRegistry(): Promise<UserRegistryFile> {
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
    return { users: [] };
  }
}

async function writeRegistry(data: UserRegistryFile): Promise<void> {
  const file = registryPath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2), "utf8");
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
    n8nWebhookUrl: found.n8nWebhookUrl,
    n8nWebhookToken: found.n8nWebhookToken,
    todoistApiToken: found.todoistApiToken,
  };
}

export async function createUser(input: {
  email: string;
  password: string;
}): Promise<SafeUser> {
  const email = normalizeEmail(input.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("INVALID_INPUT");
  }
  const password = input.password;
  if (typeof password !== "string" || password.length < 8 || password.length > 256) {
    throw new Error("INVALID_INPUT");
  }

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
    n8nWebhookUrl: user.n8nWebhookUrl,
    n8nWebhookToken: user.n8nWebhookToken,
    todoistApiToken: user.todoistApiToken,
  };
}
