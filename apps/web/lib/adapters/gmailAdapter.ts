import "server-only";

import { markIntegrationRefreshUsed, getIntegrationToken, upsertIntegrationToken } from "@/lib/integrations/tokenStore";
import { refreshGoogleToken } from "@/lib/integrations/providers/google";
import type { AdapterTodayInput, LiveProviderAdapter } from "./types";

const GMAIL_BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me";

type GmailHeader = { name?: string; value?: string };
type GmailPayload = { headers?: GmailHeader[] };

type GmailRawMessage = {
  id?: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: GmailPayload;
};

export type GmailMessage = {
  id: string;
  threadId: string | null;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  internalDate: string | null;
  labelIds: string[];
};

export type GmailCreatePayload = {
  to: string;
  subject: string;
  body: string;
};

export type GmailUpdatePayload = {
  addLabelIds?: string[];
  removeLabelIds?: string[];
};

async function withGoogleAccessToken(userId: string): Promise<string> {
  const token = await getIntegrationToken(userId, "gmail");
  if (!token?.access_token) throw new Error("gmail_not_connected");
  if (!token.expires_at || token.expires_at > Date.now() + 30_000) {
    return token.access_token;
  }
  if (!token.refresh_token) return token.access_token;
  const refreshed = await refreshGoogleToken(token.refresh_token);
  await upsertIntegrationToken(userId, "gmail", refreshed);
  await markIntegrationRefreshUsed(userId, "gmail");
  return refreshed.access_token ?? token.access_token;
}

function base64UrlEncode(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  const lower = name.toLowerCase();
  return headers?.find((entry) => (entry.name || "").toLowerCase() === lower)?.value || "";
}

function mapMessage(raw: GmailRawMessage): GmailMessage | null {
  if (!raw.id) return null;
  const headers = raw.payload?.headers || [];
  return {
    id: raw.id,
    threadId: raw.threadId ?? null,
    from: headerValue(headers, "From"),
    subject: headerValue(headers, "Subject") || "(no subject)",
    date: headerValue(headers, "Date"),
    snippet: raw.snippet || "",
    internalDate: raw.internalDate ?? null,
    labelIds: Array.isArray(raw.labelIds) ? raw.labelIds.filter((label) => Boolean(label)) : [],
  };
}

async function fetchGmailJson<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GMAIL_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`gmail_request_failed_${res.status}`);
  }
  return (await res.json()) as T;
}

export class GmailAdapter
  implements LiveProviderAdapter<GmailMessage, GmailMessage, GmailCreatePayload, GmailUpdatePayload>
{
  constructor(private readonly userId: string) {}

  async getToday(input?: AdapterTodayInput): Promise<GmailMessage[]> {
    const accessToken = await withGoogleAccessToken(this.userId);
    const query = "category:primary newer_than:1d -in:chats";
    const maxResults = String(Math.max(1, Math.min(input?.limit ?? 25, 100)));
    const list = await fetchGmailJson<{ messages?: Array<{ id?: string }> }>(
      accessToken,
      `/messages?q=${encodeURIComponent(query)}&maxResults=${encodeURIComponent(maxResults)}`,
    );
    const messages = await Promise.all(
      (list.messages || []).map(async (item) => {
        if (!item.id) return null;
        return this.getById(item.id);
      }),
    );
    return messages.filter((message): message is GmailMessage => Boolean(message));
  }

  async getById(id: string): Promise<GmailMessage | null> {
    const messageId = id.trim();
    if (!messageId) return null;
    const accessToken = await withGoogleAccessToken(this.userId);
    const raw = await fetchGmailJson<GmailRawMessage>(
      accessToken,
      `/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
    );
    return mapMessage(raw);
  }

  async search(query: string, limit = 25): Promise<GmailMessage[]> {
    const q = query.trim();
    if (!q) return [];
    const accessToken = await withGoogleAccessToken(this.userId);
    const maxResults = String(Math.max(1, Math.min(limit, 100)));
    const list = await fetchGmailJson<{ messages?: Array<{ id?: string }> }>(
      accessToken,
      `/messages?q=${encodeURIComponent(q)}&maxResults=${encodeURIComponent(maxResults)}`,
    );
    const messages = await Promise.all(
      (list.messages || []).map(async (item) => {
        if (!item.id) return null;
        return this.getById(item.id);
      }),
    );
    return messages.filter((message): message is GmailMessage => Boolean(message));
  }

  async create(payload: GmailCreatePayload): Promise<GmailMessage> {
    const accessToken = await withGoogleAccessToken(this.userId);
    const mail = [
      `To: ${payload.to.trim()}`,
      `Subject: ${payload.subject.trim()}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      payload.body,
    ].join("\r\n");
    const created = await fetchGmailJson<{ id?: string; message?: GmailRawMessage }>(accessToken, "/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: { raw: base64UrlEncode(mail) } }),
    });
    const draftMessageId = created.message?.id;
    if (!draftMessageId) {
      throw new Error("gmail_draft_create_failed");
    }
    const message = await this.getById(draftMessageId);
    if (!message) {
      throw new Error("gmail_draft_fetch_failed");
    }
    return message;
  }

  async update(id: string, payload: GmailUpdatePayload): Promise<GmailMessage> {
    const messageId = id.trim();
    if (!messageId) throw new Error("gmail_invalid_message_id");
    const accessToken = await withGoogleAccessToken(this.userId);
    await fetchGmailJson<Record<string, unknown>>(
      accessToken,
      `/messages/${encodeURIComponent(messageId)}/modify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addLabelIds: payload.addLabelIds || [],
          removeLabelIds: payload.removeLabelIds || [],
        }),
      },
    );
    const updated = await this.getById(messageId);
    if (!updated) throw new Error("gmail_message_not_found_after_update");
    return updated;
  }

  async archive(id: string): Promise<void> {
    await this.update(id, { removeLabelIds: ["INBOX"] });
  }
}

export function createGmailAdapter(userId: string): GmailAdapter {
  return new GmailAdapter(userId);
}
