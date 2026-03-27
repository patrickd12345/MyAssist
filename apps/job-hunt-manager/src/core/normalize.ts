import type { JobSource, RawJob, UnifiedJob } from "../types/job.js";
import { normalizeUrl } from "../lib/url.js";

export function makeJobId(source: JobSource, url: string, title: string): string {
  const key = `${source}:${normalizeUrl(url || title)}`;
  return key.length > 200 ? `${source}:${hashShort(key)}` : key;
}

function hashShort(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export function inferJobType(text: string): "permanent" | "contract" | "unknown" {
  const t = text.toLowerCase();
  if (
    /\bcontract\b/.test(t) ||
    /\bc2c\b/.test(t) ||
    /\bcorp-to-corp\b/.test(t) ||
    /\bconsulting\b/.test(t)
  ) {
    return "contract";
  }
  if (/\bpermanent\b/.test(t) || /\bfull[\s-]?time\b/.test(t) || /\bfte\b/.test(t)) {
    return "permanent";
  }
  return "unknown";
}

export function inferRemote(text: string): boolean {
  const t = text.toLowerCase();
  return /\bremote\b/.test(t) || /\bwork from home\b/.test(t) || /\bhybrid\b/.test(t);
}

export function rawToUnified(raw: RawJob, explicitId?: string): UnifiedJob {
  const id = explicitId ?? makeJobId(raw.source, raw.url, raw.title);
  const type =
    raw.type !== "unknown" ? raw.type : inferJobType(`${raw.title} ${raw.description}`);
  const remote = raw.remote || inferRemote(`${raw.title} ${raw.description} ${raw.location}`);
  const fingerprint = [
    raw.title.toLowerCase().replace(/\s+/g, " ").trim(),
    raw.company.toLowerCase().replace(/\s+/g, " ").trim(),
    raw.location.toLowerCase().replace(/\s+/g, " ").trim(),
    normalizeUrl(raw.url),
  ].join("|");

  return {
    id,
    title: raw.title,
    company: raw.company || "Unknown",
    location: raw.location || "",
    remote,
    type,
    source: raw.source,
    url: raw.url,
    posted_date: raw.posted_date,
    salary: raw.salary,
    description: raw.description,
    tags: [...new Set(raw.tags.map((x) => x.toLowerCase()))],
    _fingerprint: fingerprint,
    _fetched_at: new Date().toISOString(),
  };
}
