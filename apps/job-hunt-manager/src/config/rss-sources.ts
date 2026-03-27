import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** Same default as store file-store.ts (duplicated so Next.js can bundle this module without .js resolution issues). */
function defaultJobHuntDataPath(): string {
  return process.env.JOB_HUNT_DATA_PATH ?? join(homedir(), ".job-hunt-manager", "store.json");
}

export const RSS_SOURCE_ENV_KEYS = [
  "JOB_HUNT_RSS_FEEDS",
  "JOB_HUNT_LINKEDIN_RSS_URLS",
  "JOB_HUNT_INDEED_RSS_URLS",
  "JOB_HUNT_WORKOPOLIS_RSS_URLS",
  "JOB_HUNT_COMPANY_RSS_URLS",
] as const;

export type RssSourcesFileV1 = {
  version: 1;
  overrides: Partial<Record<(typeof RSS_SOURCE_ENV_KEYS)[number], string[]>>;
};

export function rssSourcesFilePath(): string {
  const override = process.env.JOB_HUNT_RSS_SOURCES_FILE?.trim();
  if (override) return resolve(override);
  return join(dirname(defaultJobHuntDataPath()), "rss-sources.json");
}

let cache: { mtimeMs: number; overrides: Partial<Record<string, string[]>> } | null = null;

function loadOverridesFromDisk(): Partial<Record<string, string[]>> {
  const p = rssSourcesFilePath();
  if (!existsSync(p)) {
    cache = null;
    return {};
  }
  const st = statSync(p);
  if (cache && cache.mtimeMs === st.mtimeMs) {
    return cache.overrides;
  }
  try {
    const raw = readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as RssSourcesFileV1;
    if (parsed?.version !== 1 || !parsed.overrides || typeof parsed.overrides !== "object") {
      cache = { mtimeMs: st.mtimeMs, overrides: {} };
      return {};
    }
    const out: Partial<Record<string, string[]>> = {};
    for (const k of RSS_SOURCE_ENV_KEYS) {
      const v = parsed.overrides[k];
      if (Array.isArray(v)) {
        out[k] = v.map((s) => String(s).trim()).filter(Boolean);
      }
    }
    cache = { mtimeMs: st.mtimeMs, overrides: out };
    return out;
  } catch {
    cache = { mtimeMs: st.mtimeMs, overrides: {} };
    return {};
  }
}

export function invalidateRssSourcesCache(): void {
  cache = null;
}

function splitEnvList(v: string | undefined): string[] {
  if (!v?.trim()) return [];
  return v
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Returns URLs for a feed source. File overrides win when the key exists in rss-sources.json
 * (including empty array = no URLs for that source). If the key is absent in the file, env vars apply.
 */
export function urlsForSource(envKey: string): string[] {
  const overrides = loadOverridesFromDisk();
  if (Object.prototype.hasOwnProperty.call(overrides, envKey)) {
    const list = overrides[envKey];
    return Array.isArray(list) ? list : [];
  }
  return splitEnvList(process.env[envKey]);
}

export function readRssSourcesFile(): RssSourcesFileV1 {
  const p = rssSourcesFilePath();
  if (!existsSync(p)) {
    return { version: 1, overrides: {} };
  }
  try {
    const raw = readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as RssSourcesFileV1;
    if (parsed?.version !== 1 || !parsed.overrides || typeof parsed.overrides !== "object") {
      return { version: 1, overrides: {} };
    }
    const overrides: RssSourcesFileV1["overrides"] = {};
    for (const k of RSS_SOURCE_ENV_KEYS) {
      const v = parsed.overrides[k];
      if (Array.isArray(v)) {
        overrides[k] = v.map((s) => String(s).trim()).filter(Boolean);
      }
    }
    return { version: 1, overrides };
  } catch {
    return { version: 1, overrides: {} };
  }
}

export function writeRssSourcesFile(data: RssSourcesFileV1): void {
  const p = rssSourcesFilePath();
  const dir = dirname(p);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
  invalidateRssSourcesCache();
}

export function effectiveUrlsSnapshot(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const k of RSS_SOURCE_ENV_KEYS) {
    out[k] = urlsForSource(k);
  }
  return out;
}
