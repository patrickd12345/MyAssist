import type { RawJob } from "../types/job.js";

const VIEW_BASE = "https://www.linkedin.com/jobs/view";

function fetchHtml(url: string): Promise<string> {
  return fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
    cache: "no-store",
  }).then((r) => (r.ok ? r.text() : ""));
}

/**
 * Turn pasted text into a canonical LinkedIn job view URL when possible.
 * Supports full URLs, paths, numeric ids, and search URLs with currentJobId.
 */
export function buildLinkedInViewUrlFromQuery(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  const jobIdFromPath = (path: string): string | null => {
    const m = path.match(/\/jobs\/view\/(\d{6,})(?:\/|$|\?)/i);
    return m?.[1] ?? null;
  };

  if (/^\d{6,}$/.test(s)) {
    return `${VIEW_BASE}/${s}`;
  }

  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    if (!u.hostname.toLowerCase().includes("linkedin.com")) return null;

    const fromView = jobIdFromPath(u.pathname);
    if (fromView) return `${VIEW_BASE}/${fromView}`;

    const cur = u.searchParams.get("currentJobId")?.trim();
    if (cur && /^\d{6,}$/.test(cur)) {
      return `${VIEW_BASE}/${cur}`;
    }
  } catch {
    return null;
  }

  const pathOnly = s.replace(/^https?:\/\//i, "");
  if (pathOnly.includes("linkedin.com")) {
    try {
      const u = new URL(`https://${pathOnly}`);
      const fromView = jobIdFromPath(u.pathname);
      if (fromView) return `${VIEW_BASE}/${fromView}`;
    } catch {
      return null;
    }
  }

  return null;
}

function parseJobPostingJsonLd(html: string): {
  title: string;
  company: string;
  location: string;
  datePosted: string | null;
} | null {
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const blocks = Array.isArray(data) ? data : [data];
    for (const node of blocks) {
      if (!node || typeof node !== "object") continue;
      const o = node as Record<string, unknown>;
      const types = o["@type"];
      const isJob =
        types === "JobPosting" ||
        (Array.isArray(types) && types.includes("JobPosting"));
      if (!isJob) continue;
      const title = typeof o.title === "string" ? o.title.trim() : "";
      const org = o.hiringOrganization;
      let company = "";
      if (org && typeof org === "object" && typeof (org as { name?: string }).name === "string") {
        company = (org as { name: string }).name.trim();
      }
      let location = "";
      const jl = o.jobLocation;
      if (jl && typeof jl === "object") {
        const addr = (jl as { address?: Record<string, string> }).address;
        if (addr && typeof addr === "object") {
          const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(
            (x): x is string => typeof x === "string" && x.length > 0,
          );
          location = parts.join(", ");
        }
      }
      if (title && company) {
        return {
          title,
          company,
          location,
          datePosted: typeof o.datePosted === "string" ? o.datePosted.slice(0, 10) : null,
        };
      }
    }
  }
  return null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/gi, "'");
}

/**
 * LinkedIn guest job pages often use og:title like:
 * `Acme hiring Senior Engineer in Toronto, ON, Canada | LinkedIn`
 * (not `Title at Company`). JSON-LD JobPosting is often absent.
 */
function parseOgTitle(html: string): { title: string; company: string; location: string } | null {
  const m =
    html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (!m) return null;
  const full = decodeHtmlEntities(m[1]);

  const at = full.match(/^(.+?)\s+at\s+(.+?)\s*\|\s*LinkedIn/i);
  if (at) {
    return { title: at[1].trim(), company: at[2].trim(), location: "" };
  }

  const main = full.replace(/\s*\|\s*LinkedIn\s*$/i, "").trim();
  const hiring = main.match(/^(.+?)\s+hiring\s+(.+)$/i);
  if (hiring) {
    const company = hiring[1].trim();
    const rest = hiring[2].trim();
    const lastIn = rest.lastIndexOf(" in ");
    if (lastIn === -1) {
      return { company, title: rest, location: "" };
    }
    return {
      company,
      title: rest.slice(0, lastIn).trim(),
      location: rest.slice(lastIn + 4).trim(),
    };
  }

  const strip = full.replace(/\s*\|\s*LinkedIn\s*$/i, "").trim();
  if (strip.length > 2) {
    return { title: strip, company: "Unknown", location: "" };
  }
  return null;
}

/**
 * Fetch a public LinkedIn job posting page and build a RawJob (best-effort).
 */
export async function fetchLinkedInRawJobFromViewPage(viewUrl: string): Promise<RawJob | null> {
  const html = await fetchHtml(viewUrl);
  if (!html || html.length < 500) return null;

  const ld = parseJobPostingJsonLd(html);
  const og = ld ? null : parseOgTitle(html);
  const title = ld?.title ?? og?.title ?? "";
  const company = ld?.company ?? og?.company ?? "";
  const location = ld?.location ?? og?.location ?? "";
  if (!title || !company) return null;

  const text = `${title} ${location}`;
  return {
    title,
    company,
    location,
    remote: /\bremote\b/i.test(text),
    type: "unknown",
    source: "linkedin",
    url: viewUrl.split("?")[0],
    posted_date: ld?.datePosted ?? null,
    salary: null,
    description: "",
    tags: [],
  };
}
