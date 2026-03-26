import { describe, expect, it } from "vitest";
import {
  buildGuestSearchUrl,
  parseLinkedInGuestJobHtml,
} from "../src/connectors/linkedin-guest-scrape.js";

const SAMPLE_HTML = `<!DOCTYPE html>
<li>
<div class="base-card relative job-search-card" data-entity-urn="urn:li:jobPosting:1">
<a class="base-card__full-link" href="https://ca.linkedin.com/jobs/view/test-job-at-acme-123?position=1&amp;refId=x">
<span class="sr-only">Ignored</span>
</a>
<div class="base-search-card__info">
<h3 class="base-search-card__title">Senior Engineer</h3>
<h4 class="base-search-card__subtitle">
<a class="hidden-nested-link" data-tracking-control-name="public_jobs_jserp-result_job-search-card-subtitle" href="https://www.linkedin.com/company/acme">Acme Corp</a>
</h4>
<div class="base-search-card__metadata">
<span class="job-search-card__location">Toronto, ON</span>
<time class="job-search-card__listdate" datetime="2026-03-01">1 week ago</time>
</div>
</div>
</div>
</li>`;

describe("parseLinkedInGuestJobHtml", () => {
  it("extracts title, company, url, location, date", () => {
    const jobs = parseLinkedInGuestJobHtml(SAMPLE_HTML);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      url: "https://ca.linkedin.com/jobs/view/test-job-at-acme-123",
      title: "Senior Engineer",
      company: "Acme Corp",
      location: "Toronto, ON",
      posted_date: "2026-03-01",
    });
  });
});

describe("buildGuestSearchUrl", () => {
  it("maps jobs/search/rss query to guest API", () => {
    const u = buildGuestSearchUrl(
      "https://www.linkedin.com/jobs/search/rss?keywords=engineer&location=Toronto",
    );
    expect(u).not.toBeNull();
    expect(u!.origin + u!.pathname).toBe(
      "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search",
    );
    expect(u!.searchParams.get("keywords")).toBe("engineer");
    expect(u!.searchParams.get("location")).toBe("Toronto");
    expect(u!.searchParams.get("start")).toBe("0");
  });

  it("passes through existing guest API URLs", () => {
    const u = buildGuestSearchUrl(
      "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=a&start=10",
    );
    expect(u).not.toBeNull();
    expect(u!.searchParams.get("keywords")).toBe("a");
  });

  it("maps jobs/search with geoId to guest API and drops UI-only params", () => {
    const u = buildGuestSearchUrl(
      "https://www.linkedin.com/jobs/search/?currentJobId=4383375251&geoId=90009540&keywords=Ai&origin=JOB_SEARCH_PAGE_JOB_FILTER",
    );
    expect(u).not.toBeNull();
    expect(u!.searchParams.get("keywords")).toBe("Ai");
    expect(u!.searchParams.get("geoId")).toBe("90009540");
    expect(u!.searchParams.get("currentJobId")).toBeNull();
    expect(u!.searchParams.get("origin")).toBeNull();
    expect(u!.searchParams.get("start")).toBe("0");
  });

  it("ignores start offset in the browser URL so first-page guest URL matches without start", () => {
    const withoutStart =
      "https://www.linkedin.com/jobs/search/?currentJobId=4384125483&geoId=90009540&keywords=Ai&origin=JOB_SEARCH_PAGE_JOB_FILTER";
    const withStart50 = `${withoutStart}&start=50`;
    const a = buildGuestSearchUrl(withoutStart);
    const b = buildGuestSearchUrl(withStart50);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.toString()).toBe(b!.toString());
    expect(a!.searchParams.get("start")).toBe("0");
  });
});
