import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { decryptJson, encryptJson } from "./crypto";
import type { IntegrationProvider, IntegrationTokenPayload, StoredIntegrationRecord } from "./types";

type IntegrationsFile = {
  updated_at: string;
  integrations: StoredIntegrationRecord[];
};

function sanitizeUserId(userId: string): string {
  const t = userId.trim();
  if (!t) return "_anonymous";
  return t.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

function integrationsPath(userId: string): string {
  return path.join(
    process.cwd(),
    ".myassist-memory",
    "users",
    sanitizeUserId(userId),
    "integrations.json",
  );
}

function emptyFile(): IntegrationsFile {
  return { updated_at: new Date().toISOString(), integrations: [] };
}

async function loadFile(userId: string): Promise<IntegrationsFile> {
  try {
    const raw = await readFile(integrationsPath(userId), "utf8");
    const parsed = JSON.parse(raw) as Partial<IntegrationsFile>;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.integrations)) {
      return emptyFile();
    }
    return {
      updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : new Date().toISOString(),
      integrations: parsed.integrations.filter(
        (row): row is StoredIntegrationRecord =>
          Boolean(
            row &&
              typeof row === "object" &&
              typeof row.provider === "string" &&
              typeof row.status === "string" &&
              typeof row.encrypted_payload === "string",
          ),
      ),
    };
  } catch {
    return emptyFile();
  }
}

async function saveFile(userId: string, file: IntegrationsFile): Promise<void> {
  const target = integrationsPath(userId);
  await mkdir(path.dirname(target), { recursive: true });
  file.updated_at = new Date().toISOString();
  await writeFile(target, JSON.stringify(file, null, 2), "utf8");
}

export async function upsertIntegrationToken(
  userId: string,
  provider: IntegrationProvider,
  payload: IntegrationTokenPayload,
): Promise<void> {
  const file = await loadFile(userId);
  const now = new Date().toISOString();
  const encrypted_payload = encryptJson(payload);
  const scopes = typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [];
  const existingIdx = file.integrations.findIndex((x) => x.provider === provider);
  const next: StoredIntegrationRecord = {
    provider,
    status: "connected",
    encrypted_payload,
    scopes,
    connected_at: existingIdx >= 0 ? file.integrations[existingIdx].connected_at : now,
    updated_at: now,
    refresh_last_used_at: existingIdx >= 0 ? file.integrations[existingIdx].refresh_last_used_at : undefined,
    revoked_at: undefined,
  };
  if (existingIdx >= 0) file.integrations[existingIdx] = next;
  else file.integrations.push(next);
  await saveFile(userId, file);
}

export async function getIntegrationToken(
  userId: string,
  provider: IntegrationProvider,
): Promise<IntegrationTokenPayload | null> {
  const file = await loadFile(userId);
  const row = file.integrations.find((x) => x.provider === provider && x.status === "connected");
  if (!row) return null;
  try {
    return decryptJson<IntegrationTokenPayload>(row.encrypted_payload);
  } catch {
    console.warn(`[Integrations] Could not decrypt token for ${provider} (key changed?). Treating as disconnected.`);
    return null;
  }
}

export async function markIntegrationRefreshUsed(
  userId: string,
  provider: IntegrationProvider,
): Promise<void> {
  const file = await loadFile(userId);
  const idx = file.integrations.findIndex((x) => x.provider === provider && x.status === "connected");
  if (idx < 0) return;
  file.integrations[idx].refresh_last_used_at = new Date().toISOString();
  file.integrations[idx].updated_at = new Date().toISOString();
  await saveFile(userId, file);
}

export async function revokeIntegration(userId: string, provider: IntegrationProvider): Promise<void> {
  const file = await loadFile(userId);
  const idx = file.integrations.findIndex((x) => x.provider === provider);
  if (idx < 0) return;
  const now = new Date().toISOString();
  file.integrations[idx] = {
    ...file.integrations[idx],
    status: "revoked",
    revoked_at: now,
    updated_at: now,
  };
  await saveFile(userId, file);
}

export async function listIntegrationStatuses(userId: string): Promise<
  Array<{ provider: IntegrationProvider; status: "connected" | "revoked" | "disconnected"; updated_at?: string }>
> {
  const providers: IntegrationProvider[] = ["gmail", "todoist", "google_calendar"];
  const file = await loadFile(userId);
  return providers.map((provider) => {
    const row = file.integrations.find((x) => x.provider === provider);
    if (!row) return { provider, status: "disconnected" as const };
    return { provider, status: row.status, updated_at: row.updated_at };
  });
}
