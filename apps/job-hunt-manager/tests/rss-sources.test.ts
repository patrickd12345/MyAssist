import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("rss-sources overrides", () => {
  let tmp: string;
  let prevFile: string | undefined;
  let prevLinkedIn: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "jh-rss-"));
    prevFile = process.env.JOB_HUNT_RSS_SOURCES_FILE;
    prevLinkedIn = process.env.JOB_HUNT_LINKEDIN_RSS_URLS;
    process.env.JOB_HUNT_RSS_SOURCES_FILE = join(tmp, "rss-sources.json");
    process.env.JOB_HUNT_LINKEDIN_RSS_URLS = "https://env.example/feed";
  });

  afterEach(() => {
    if (prevFile === undefined) delete process.env.JOB_HUNT_RSS_SOURCES_FILE;
    else process.env.JOB_HUNT_RSS_SOURCES_FILE = prevFile;
    if (prevLinkedIn === undefined) delete process.env.JOB_HUNT_LINKEDIN_RSS_URLS;
    else process.env.JOB_HUNT_LINKEDIN_RSS_URLS = prevLinkedIn;
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("uses file override over env when key is set in rss-sources.json", async () => {
    const { invalidateRssSourcesCache, urlsForSource } = await import("../src/config/rss-sources.js");
    invalidateRssSourcesCache();
    writeFileSync(
      process.env.JOB_HUNT_RSS_SOURCES_FILE!,
      JSON.stringify({
        version: 1,
        overrides: { JOB_HUNT_LINKEDIN_RSS_URLS: ["https://file.example/feed"] },
      }),
      "utf8",
    );
    invalidateRssSourcesCache();
    expect(urlsForSource("JOB_HUNT_LINKEDIN_RSS_URLS")).toEqual(["https://file.example/feed"]);
  });

  it("falls back to env when key is absent from file", async () => {
    const { invalidateRssSourcesCache, urlsForSource } = await import("../src/config/rss-sources.js");
    invalidateRssSourcesCache();
    writeFileSync(
      process.env.JOB_HUNT_RSS_SOURCES_FILE!,
      JSON.stringify({ version: 1, overrides: {} }),
      "utf8",
    );
    invalidateRssSourcesCache();
    expect(urlsForSource("JOB_HUNT_LINKEDIN_RSS_URLS")).toEqual(["https://env.example/feed"]);
  });

  it("writeRssSourcesFile persists and is read back", async () => {
    const {
      invalidateRssSourcesCache,
      readRssSourcesFile,
      writeRssSourcesFile,
    } = await import("../src/config/rss-sources.js");
    invalidateRssSourcesCache();
    writeRssSourcesFile({
      version: 1,
      overrides: { JOB_HUNT_INDEED_RSS_URLS: ["https://indeed.example/rss"] },
    });
    expect(existsSync(process.env.JOB_HUNT_RSS_SOURCES_FILE!)).toBe(true);
    invalidateRssSourcesCache();
    const r = readRssSourcesFile();
    expect(r.overrides.JOB_HUNT_INDEED_RSS_URLS).toEqual(["https://indeed.example/rss"]);
  });
});
