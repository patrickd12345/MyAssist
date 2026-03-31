export type IntegrationProvider = "gmail" | "todoist" | "google_calendar";

export type IntegrationTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_at?: number;
  /** Google `sub` from userinfo (OAuth). */
  provider_account_id?: string;
  /** Google account email from userinfo when available. */
  provider_account_email?: string;
  raw?: Record<string, unknown>;
};

export type StoredIntegrationRecord = {
  provider: IntegrationProvider;
  status: "connected" | "revoked";
  encrypted_payload: string;
  scopes?: string[];
  connected_at: string;
  updated_at: string;
  refresh_last_used_at?: string;
  revoked_at?: string;
};
