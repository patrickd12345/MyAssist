import "server-only";

/**
 * Safe read-only Gmail inbox list + metadata fetch.
 * Hard-caps page size; supports pagination via pageToken; does not scan full mailbox.
 */

const GMAIL_MESSAGES_LIST = "https://gmail.googleapis.com/gmail/v1/users/me/messages";

/** Default page size for explicit inbox fetches (API route and new callers). */
export const GMAIL_INBOX_DEFAULT_MAX_RESULTS = 10;

/** Hard cap — never exceed this for a single list+expand request (avoids unbounded work). */
export const GMAIL_INBOX_HARD_MAX_RESULTS = 50;

/** Daily-context / legacy signal fetch uses a fixed bounded window (unchanged behavior). */
export const GMAIL_SIGNALS_FETCH_MAX_RESULTS = 20;

export const GMAIL_SIGNALS_DEFAULT_QUERY = "";

const MAX_QUERY_STRING_LEN = 500;

export type GmailInboxPreview = {
  id: string;
  threadId: string | null;
  internalDate: string | null;
  labelIds: string[];
  snippet: string;
  from: string;
  subject: string;
  date: string;
  unread: boolean;
  important: boolean;
};

export function clampGmailPageSize(requested: number | undefined): number {
  const n = typeof requested === "number" && Number.isFinite(requested) ? Math.floor(requested) : GMAIL_INBOX_DEFAULT_MAX_RESULTS;
  return Math.max(1, Math.min(n, GMAIL_INBOX_HARD_MAX_RESULTS));
}

/**
 * Single-line Gmail search query; length-limited. Empty/invalid falls back to `fallback`.
 */
export function sanitizeGmailQuery(q: string | undefined, fallback: string): string {
  if (typeof q !== "string") return fallback;
  const collapsed = q.replace(/[\r\n\t]+/g, " ").trim().slice(0, MAX_QUERY_STRING_LEN);
  // We allow an explicit empty string ("") as a valid query to avoid falling back when the user wants no filters.
  return q.trim() === "" ? "" : (collapsed.length > 0 ? collapsed : fallback);
}

type GmailListApiResponse = {
  messages?: Array<{ id?: string; threadId?: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

type GmailMetadataMessage = {
  id?: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: { headers?: Array<{ name?: string; value?: string }> };
};

function headerValue(headers: Array<{ name?: string; value?: string }> | undefined, name: string): string {
  const lower = name.toLowerCase();
  return headers?.find((h) => (h.name || "").toLowerCase() === lower)?.value || "";
}

export function parseGmailMetadataToPreview(msg: GmailMetadataMessage, fallbackId: string): GmailInboxPreview | null {
  const id = typeof msg.id === "string" ? msg.id : fallbackId;
  if (!id) return null;
  const headers = msg.payload?.headers || [];
  const labelIds = Array.isArray(msg.labelIds) ? msg.labelIds.filter((x): x is string => typeof x === "string") : [];
  return {
    id,
    threadId: typeof msg.threadId === "string" ? msg.threadId : null,
    internalDate: typeof msg.internalDate === "string" ? msg.internalDate : null,
    labelIds,
    snippet: typeof msg.snippet === "string" ? msg.snippet : "",
    from: headerValue(headers, "From"),
    subject: headerValue(headers, "Subject") || "(no subject)",
    date: headerValue(headers, "Date"),
    unread: labelIds.includes("UNREAD"),
    important: labelIds.includes("IMPORTANT"),
  };
}

export type GmailInboxPageResult =
  | {
      ok: true;
      messages: GmailInboxPreview[];
      nextPageToken?: string;
      queryUsed: string;
      maxResults: number;
    }
  | { ok: false; status: number; error: string };

/**
 * Lists messages with bounded maxResults, optional pageToken, optional query.
 * Expands each id with format=metadata (From, Subject, Date) — read-only.
 */
export async function fetchGmailInboxPage(
  accessToken: string,
  input: {
    maxResults?: number;
    pageToken?: string;
    q?: string;
    /** When set, used instead of `q` after sanitization (caller supplies full default). */
    defaultQuery?: string;
  },
): Promise<GmailInboxPageResult> {
  const maxResults = clampGmailPageSize(input.maxResults);
  const fallbackQ = input.defaultQuery ?? GMAIL_SIGNALS_DEFAULT_QUERY;
  const queryUsed = sanitizeGmailQuery(input.q, fallbackQ);

  const listUrl = new URL(GMAIL_MESSAGES_LIST);
  listUrl.searchParams.set("maxResults", String(maxResults));
  listUrl.searchParams.set("q", queryUsed);
  const pt = typeof input.pageToken === "string" ? input.pageToken.trim() : "";
  if (pt) listUrl.searchParams.set("pageToken", pt);

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!listRes.ok) {
    return { ok: false, status: listRes.status, error: `gmail_list_${listRes.status}` };
  }

  const listJson = (await listRes.json()) as GmailListApiResponse;
  const stubs = listJson.messages || [];
  const nextPageToken =
    typeof listJson.nextPageToken === "string" && listJson.nextPageToken.trim()
      ? listJson.nextPageToken.trim()
      : undefined;

  const previewPromises = stubs.map(async (stub) => {
    const mid = typeof stub.id === "string" ? stub.id : "";
    if (!mid) return null;

    const detailsRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
        mid,
      )}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
    );

    if (!detailsRes.ok) return null;

    const msg = (await detailsRes.json()) as GmailMetadataMessage;
    return parseGmailMetadataToPreview(msg, mid);
  });

  const previews = (await Promise.all(previewPromises)).filter((p): p is GmailInboxPreview => p !== null);

  return {
    ok: true,
    messages: previews,
    nextPageToken,
    queryUsed,
    maxResults,
  };
}
