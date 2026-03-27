import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildLinkedInViewUrlFromQuery,
  fetchLinkedInRawJobFromViewPage,
} from "../src/connectors/linkedin-job-view.js";

describe("buildLinkedInViewUrlFromQuery", () => {
  it("maps bare numeric id to view URL", () => {
    expect(buildLinkedInViewUrlFromQuery("4384125483")).toBe("https://www.linkedin.com/jobs/view/4384125483");
  });

  it("extracts id from full view URL", () => {
    expect(buildLinkedInViewUrlFromQuery("https://www.linkedin.com/jobs/view/1234567890/?trk=abc")).toBe(
      "https://www.linkedin.com/jobs/view/1234567890",
    );
  });

  it("uses currentJobId from search URL", () => {
    expect(
      buildLinkedInViewUrlFromQuery(
        "https://www.linkedin.com/jobs/search/?currentJobId=9988776655&keywords=rust",
      ),
    ).toBe("https://www.linkedin.com/jobs/view/9988776655");
  });

  it("returns null for non-LinkedIn input", () => {
    expect(buildLinkedInViewUrlFromQuery("https://indeed.com/viewjob?jk=abc")).toBeNull();
  });
});

describe("fetchLinkedInRawJobFromViewPage", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("parses JSON-LD JobPosting", async () => {
    const pad = "x".repeat(400);
    const html = `<!DOCTYPE html><html><head>
<script type="application/ld+json">{"@type":"JobPosting","title":"Staff Engineer","hiringOrganization":{"name":"Acme Labs"},"jobLocation":{"address":{"addressLocality":"Toronto","addressRegion":"ON"}},"datePosted":"2024-06-01"}</script>
</head><body>${pad}</body></html>`;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => html });

    const r = await fetchLinkedInRawJobFromViewPage("https://www.linkedin.com/jobs/view/111");
    expect(r?.title).toBe("Staff Engineer");
    expect(r?.company).toBe("Acme Labs");
    expect(r?.location).toContain("Toronto");
    expect(r?.source).toBe("linkedin");
  });

  it("falls back to og:title", async () => {
    const pad = "y".repeat(450);
    const html = `<!DOCTYPE html><html><head>
<meta property="og:title" content="PM at Contoso | LinkedIn" />
</head><body>${pad}</body></html>`;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => html });

    const r = await fetchLinkedInRawJobFromViewPage("https://www.linkedin.com/jobs/view/222");
    expect(r?.title).toBe("PM");
    expect(r?.company).toBe("Contoso");
  });

  it("parses LinkedIn hiring-style og:title (company hiring title in location)", async () => {
    const pad = "z".repeat(450);
    const html = `<!DOCTYPE html><html><head>
<meta content="Dollarama hiring Chef d&amp;#39;équipe, SAP ABAP in Mont-Royal, Quebec, Canada | LinkedIn" property="og:title" />
</head><body>${pad}</body></html>`;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => html });

    const r = await fetchLinkedInRawJobFromViewPage("https://www.linkedin.com/jobs/view/4323549200");
    expect(r?.company).toBe("Dollarama");
    expect(r?.title).toContain("SAP ABAP");
    expect(r?.location).toContain("Mont-Royal");
  });
});
