import { describe, expect, it } from "vitest";
import { GMAIL_MVP_OAUTH_SCOPES, googleScopesFor, mergeGoogleTokenPayload } from "./google";

describe("google OAuth (Gmail MVP)", () => {
  it("requests the Phase B read-only scope set (no gmail.modify)", () => {
    expect(GMAIL_MVP_OAUTH_SCOPES).toEqual([
      "openid",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/gmail.readonly",
    ]);
    const joined = googleScopesFor("gmail");
    expect(joined).not.toContain("gmail.modify");
    expect(joined).toContain("gmail.readonly");
  });

  it("preserves refresh_token when Google omits it on reconnect", () => {
    const merged = mergeGoogleTokenPayload(
      { refresh_token: "old_refresh", scope: "openid", expires_at: 1 },
      { access_token: "new_access", expires_at: 2 },
    );
    expect(merged.refresh_token).toBe("old_refresh");
    expect(merged.access_token).toBe("new_access");
  });
});
