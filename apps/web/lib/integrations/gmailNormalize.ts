/**
 * Canonical Gmail message preview + deterministic dedupe (read-only, in-process).
 * Intended for stable downstream signal detection without a full sync engine.
 */

import type { GmailInboxPreview } from "./gmailInboxFetch";

/** Stable internal record for one Gmail message (metadata-level). */
export type GmailNormalizedMessage = {
  messageId: string;
  threadId: string | null;
  internalDate: string | null;
  dateHeader: string | null;
  from: string;
  subject: string;
  snippet: string;
  labelIds: string[];
  unread: boolean;
  important: boolean;
  /** Google OAuth userinfo `sub` when stored on the integration token. */
  providerAccountId: string | null;
  /** ISO timestamp when this record was normalized (same batch shares one value if caller passes it). */
  normalizedAt: string;
};

function completenessScore(m: GmailNormalizedMessage): number {
  let s = 0;
  if (m.messageId.trim()) s += 100;
  if (m.threadId) s += 10;
  if (m.internalDate) s += 8;
  if (m.dateHeader) s += 4;
  if (m.from.trim()) s += 4;
  if (m.subject.trim()) s += 2;
  if (m.snippet.trim()) s += 2;
  s += Math.min(m.snippet.length, 500);
  s += Math.min(m.labelIds.length, 20);
  if (m.providerAccountId) s += 1;
  return s;
}

/** When two rows share a dedupe key, keep the more complete one; on tie keep the first (stable). */
function pickMoreComplete(a: GmailNormalizedMessage, b: GmailNormalizedMessage): GmailNormalizedMessage {
  const sa = completenessScore(a);
  const sb = completenessScore(b);
  if (sb > sa) return b;
  return a;
}

function dedupeKey(m: GmailNormalizedMessage): string | null {
  if (m.messageId.trim()) {
    return `id:${m.messageId.trim()}`;
  }
  const t = m.threadId ?? "";
  const id = m.internalDate ?? "";
  const sub = m.subject ?? "";
  if (!t && !id && !sub) return null;
  return `fb:${t}\0${id}\0${sub}`;
}

/**
 * Normalize a Gmail API metadata preview into the canonical shape.
 * Does not invent values: empty/missing headers become null or "" as appropriate.
 */
export function normalizeGmailInboxPreview(
  preview: GmailInboxPreview,
  ctx?: {
    providerAccountId?: string | null;
    normalizedAt?: string;
  },
): GmailNormalizedMessage {
  const dateRaw = preview.date.trim();
  return {
    messageId: preview.id,
    threadId: preview.threadId,
    internalDate: preview.internalDate,
    dateHeader: dateRaw.length > 0 ? preview.date : null,
    from: preview.from,
    subject: preview.subject,
    snippet: preview.snippet,
    labelIds: [...preview.labelIds],
    unread: preview.unread,
    important: preview.important,
    providerAccountId: ctx?.providerAccountId ?? null,
    normalizedAt: ctx?.normalizedAt ?? new Date().toISOString(),
  };
}

/**
 * Deterministic dedupe: primary key is `messageId`.
 * Fallback key (threadId + internalDate + subject) only when `messageId` is empty.
 * Preserves input order of first occurrence; duplicate keys replace with the more complete row.
 */
export function dedupeNormalizedGmailMessages(items: GmailNormalizedMessage[]): GmailNormalizedMessage[] {
  const byKey = new Map<string, GmailNormalizedMessage>();
  const order: string[] = [];
  for (const m of items) {
    const key = dedupeKey(m);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, m);
      order.push(key);
      continue;
    }
    byKey.set(key, pickMoreComplete(prev, m));
  }
  return order.map((k) => byKey.get(k)!);
}

/**
 * Merge multiple pages (e.g. repeated fetches) and dedupe globally — avoids double-counting the same message across pages.
 */
export function mergeNormalizedGmailPages(pages: GmailNormalizedMessage[][]): GmailNormalizedMessage[] {
  return dedupeNormalizedGmailMessages(pages.flat());
}

/** Daily-context / legacy `fetchGmailSignals` row shape (includes `id` for GmailSignal mapping). */
export function normalizedToLegacySignalRecord(n: GmailNormalizedMessage): Record<string, unknown> {
  return {
    id: n.messageId,
    threadId: n.threadId,
    from: n.from,
    subject: n.subject,
    date: n.dateHeader ?? "",
    snippet: n.snippet,
    label_ids: n.labelIds,
    internalDate: n.internalDate,
    unread: n.unread,
    important: n.important,
    providerAccountId: n.providerAccountId,
    normalizedAt: n.normalizedAt,
  };
}
