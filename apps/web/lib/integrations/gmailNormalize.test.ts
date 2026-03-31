import { describe, expect, it } from "vitest";
import type { GmailInboxPreview } from "./gmailInboxFetch";
import {
  dedupeNormalizedGmailMessages,
  mergeNormalizedGmailPages,
  normalizeGmailInboxPreview,
  normalizedToLegacySignalRecord,
} from "./gmailNormalize";

function preview(overrides: Partial<GmailInboxPreview> & { id: string }): GmailInboxPreview {
  return {
    id: overrides.id,
    threadId: overrides.threadId !== undefined ? overrides.threadId : "t1",
    internalDate: overrides.internalDate !== undefined ? overrides.internalDate : "1000",
    labelIds: overrides.labelIds ?? ["INBOX"],
    snippet: overrides.snippet ?? "",
    from: overrides.from ?? "a@b.com",
    subject: overrides.subject ?? "S",
    date: overrides.date ?? "Mon, 1 Jan 2024 00:00:00 +0000",
    unread: overrides.unread ?? false,
    important: overrides.important ?? false,
  };
}

describe("normalizeGmailInboxPreview", () => {
  it("maps fields explicitly and leaves missing date as null", () => {
    const n = normalizeGmailInboxPreview(
      preview({ id: "m1", date: "   ", internalDate: null }),
      { providerAccountId: "sub-1", normalizedAt: "2024-01-01T00:00:00.000Z" },
    );
    expect(n.messageId).toBe("m1");
    expect(n.dateHeader).toBeNull();
    expect(n.internalDate).toBeNull();
    expect(n.providerAccountId).toBe("sub-1");
    expect(n.normalizedAt).toBe("2024-01-01T00:00:00.000Z");
  });
});

describe("dedupeNormalizedGmailMessages", () => {
  it("collapses duplicate messageId", () => {
    const a = normalizeGmailInboxPreview(preview({ id: "m1", snippet: "a" }), { normalizedAt: "t0" });
    const b = normalizeGmailInboxPreview(preview({ id: "m1", snippet: "longer snippet for completeness" }), {
      normalizedAt: "t0",
    });
    const out = dedupeNormalizedGmailMessages([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].snippet).toBe("longer snippet for completeness");
  });

  it("prefers first when completeness ties", () => {
    const a = normalizeGmailInboxPreview(preview({ id: "m1", snippet: "x" }), { normalizedAt: "t0" });
    const b = normalizeGmailInboxPreview(preview({ id: "m1", snippet: "x" }), { normalizedAt: "t1" });
    const out = dedupeNormalizedGmailMessages([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].normalizedAt).toBe("t0");
  });

  it("keeps stable order by first occurrence key", () => {
    const n1 = normalizeGmailInboxPreview(preview({ id: "m2" }), { normalizedAt: "t" });
    const n2 = normalizeGmailInboxPreview(preview({ id: "m1" }), { normalizedAt: "t" });
    const out = dedupeNormalizedGmailMessages([n1, n2]);
    expect(out.map((x) => x.messageId)).toEqual(["m2", "m1"]);
  });
});

describe("mergeNormalizedGmailPages", () => {
  it("dedupes across pages (same id on page 1 and 2)", () => {
    const p1 = normalizeGmailInboxPreview(preview({ id: "m1" }), { normalizedAt: "t" });
    const p2 = normalizeGmailInboxPreview(preview({ id: "m1", snippet: "updated" }), { normalizedAt: "t" });
    const merged = mergeNormalizedGmailPages([[p1], [p2]]);
    expect(merged).toHaveLength(1);
    expect(merged[0].snippet).toBe("updated");
  });
});

describe("normalizedToLegacySignalRecord", () => {
  it("maps messageId to id for GmailSignal mappers", () => {
    const n = normalizeGmailInboxPreview(preview({ id: "mid" }), { normalizedAt: "t" });
    const r = normalizedToLegacySignalRecord(n);
    expect(r.id).toBe("mid");
    expect(r.label_ids).toEqual(["INBOX"]);
  });
});

describe("fallback dedupe key", () => {
  it("dedupes empty messageId rows by threadId+internalDate+subject", () => {
    const a = normalizeGmailInboxPreview(
      {
        id: "",
        threadId: "th",
        internalDate: "99",
        labelIds: [],
        snippet: "",
        from: "",
        subject: "Subj",
        date: "",
        unread: false,
        important: false,
      },
      { normalizedAt: "t" },
    );
    const b = normalizeGmailInboxPreview(
      {
        id: "",
        threadId: "th",
        internalDate: "99",
        labelIds: ["INBOX"],
        snippet: "more",
        from: "",
        subject: "Subj",
        date: "",
        unread: false,
        important: false,
      },
      { normalizedAt: "t" },
    );
    const out = dedupeNormalizedGmailMessages([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].snippet).toBe("more");
  });
});
