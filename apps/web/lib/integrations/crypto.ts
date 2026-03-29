import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";

const ALGO = "aes-256-gcm";

function resolveKey(): Buffer {
  const runtime = resolveMyAssistRuntimeEnv();
  const env = runtime.integrationsEncryptionKey;
  if (env) {
    try {
      const raw = Buffer.from(env, "base64");
      if (raw.length === 32) return raw;
    } catch {
      // fall through
    }
    const hashed = createHash("sha256").update(env).digest();
    return hashed;
  }
  const fallback = runtime.authSecret || "myassist-dev-integration-key";
  return createHash("sha256").update(fallback).digest();
}

export function encryptJson(input: unknown): string {
  const key = resolveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const plaintext = Buffer.from(JSON.stringify(input), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptJson<T>(payload: string): T {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted payload format");
  }
  const key = resolveKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}
