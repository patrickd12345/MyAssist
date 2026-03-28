import { describe, expect, it, vi } from "vitest";
import { createOAuthState, verifyGoogleOAuthState, verifyOAuthState } from "./oauthState";

describe("oauthState", () => {
  it("verifyGoogleOAuthState returns provider from gmail flow", () => {
    vi.stubEnv("AUTH_SECRET", "test-secret-for-oauth-state");
    const state = createOAuthState("user-1", "gmail");
    const out = verifyGoogleOAuthState(state);
    expect(out).toEqual({ userId: "user-1", provider: "gmail" });
    vi.unstubAllEnvs();
  });

  it("verifyGoogleOAuthState returns provider from calendar flow", () => {
    vi.stubEnv("AUTH_SECRET", "test-secret-for-oauth-state");
    const state = createOAuthState("user-2", "google_calendar");
    const out = verifyGoogleOAuthState(state);
    expect(out).toEqual({ userId: "user-2", provider: "google_calendar" });
    vi.unstubAllEnvs();
  });

  it("verifyOAuthState still requires path provider to match", () => {
    vi.stubEnv("AUTH_SECRET", "test-secret-for-oauth-state");
    const state = createOAuthState("user-3", "gmail");
    expect(() => verifyOAuthState(state, "google_calendar")).toThrow("OAuth state provider mismatch");
    vi.unstubAllEnvs();
  });
});
