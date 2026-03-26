import type { RawJob } from "../types/job.js";

const GUEST_SEARCH_BASE =
  "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGES = Math.min(
  20,
  Math.max(
    1,
    Number.parseInt(process.env.JOB_HUNT_LINKEDIN_GUEST_MAX_PAGES ?? "5", 10) || 5,
  ),
);

/** Parsed job card from guest API HTML fragment. */
export type LinkedInGuestCard = {
  url: string;
  title: string;
  company: string;
  location: string;
  posted_date: string;
};

function extractBetween(html: string, start: string, end: string): string | null {
  const i = html.indexOf(start);
  if (i === -1) return null;
  const s = i + start.length;
  const e = html.indexOf(end, s);
  if (e === -1) return null;
  return html.slice(s, e).trim();
}

/**
 * Parse LinkedIn guest job search API HTML (list of job cards).
 * Exported for unit tests.
 */
export function parseLinkedInGuestJobHtml(html: string): LinkedInGuestCard[] {
  const jobs: LinkedInGuestCard[] = [];
  const chunks = html.split('class="base-card');

  for (let i = 1; i < chunks.length; i++) {
    const card = chunks[i];
    if (!card.includes("job-search-card")) continue;

    const viewMatch = card.match(
      /href="(https:\/\/[^"]*linkedin\.com\/jobs\/view[^"?]+)(?:\?[^"]*)?"/,
    );
    const url = viewMatch?.[1]?.trim() ?? "";

    let title = extractBetween(card, '<h3 class="base-search-card__title">', "</h3>");
    if (title) title = title.replace(/\s+/g, " ").trim();

    let company = extractBetween(
      card,
      'data-tracking-control-name="public_jobs_jserp-result_job-search-card-subtitle"',
      "</a>",
    );
    if (company) {
      const gt = company.indexOf(">");
      company = (gt >= 0 ? company.slice(gt + 1) : company).replace(/\s+/g, " ").trim();
    } else {
      company = extractBetween(card, '<h4 class="base-search-card__subtitle">', "</h4>");
      if (company) {
        company = company.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      }
    }

    let location = extractBetween(card, '<span class="job-search-card__location">', "</span>");
    if (location) location = location.replace(/\s+/g, " ").trim();

    const timeChunk = extractBetween(card, '<time class="job-search-card__listdate"', "</time>");
    let posted = "";
    if (timeChunk) {
      const dm = timeChunk.match(/datetime="([^"]+)"/);
      posted = dm?.[1]?.trim() ?? "";
    }

    if (url && title && company) {
      jobs.push({
        url,
        title,
        company,
        location: location ?? "",
        posted_date: posted,
      });
    }
  }

  return jobs;
}

/**
 * Build guest API URL from a LinkedIn jobs search or RSS URL (same query params).
 */
export function buildGuestSearchUrl(linkedinUrl: string): URL | null {
  let u: URL;
  try {
    u = new URL(linkedinUrl.trim());
  } catch {
    return null;
  }
  if (!u.hostname.toLowerCase().includes("linkedin.com")) {
    return null;
  }

  if (u.pathname.includes("/jobs-guest/jobs/api/seeMoreJobPostings")) {
    return u;
  }

  const out = new URL(GUEST_SEARCH_BASE);
  /** UI/session params that can skew guest results vs a clean search URL. */
  const dropParam = (k: string) =>
    k === "refId" ||
    k === "trackingId" ||
    k === "trk" ||
    k === "currentJobId" ||
    k === "origin" ||
    k === "refresh";
  for (const [k, v] of u.searchParams.entries()) {
    if (dropParam(k)) continue;
    out.searchParams.append(k, v);
  }
  out.searchParams.set("start", "0");
  return out;
}

function cardToRawJob(c: LinkedInGuestCard): RawJob {
  const text = `${c.title} ${c.location}`;
  return {
    title: c.title,
    company: c.company,
    location: c.location,
    remote: /\bremote\b/i.test(text),
    type: "unknown",
    source: "linkedin",
    url: c.url,
    posted_date: c.posted_date || null,
    salary: null,
    description: "",
    tags: [],
  };
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
    cache: "no-store",
  });
  if (!res.ok) return "";
  return res.text();
}

/**
 * Fetch all pages for one LinkedIn search URL and return RawJob list (deduped by URL).
 */
export async function fetchLinkedInGuestJobsForUrl(linkedinUrl: string): Promise<RawJob[]> {
  const base = buildGuestSearchUrl(linkedinUrl);
  if (!base) return [];

  const seen = new Set<string>();
  const raw: RawJob[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const start = page * DEFAULT_PAGE_SIZE;
    const pageUrl = new URL(base.toString());
    pageUrl.searchParams.set("start", String(start));

    const html = await fetchHtml(pageUrl.toString());
    if (!html.trim()) break;

    const cards = parseLinkedInGuestJobHtml(html);
    if (cards.length === 0) break;

    let newCount = 0;
    for (const c of cards) {
      if (seen.has(c.url)) continue;
      seen.add(c.url);
      raw.push(cardToRawJob(c));
      newCount++;
    }

    if (newCount === 0 || cards.length < DEFAULT_PAGE_SIZE) {
      break;
    }
  }

  return raw;
}
