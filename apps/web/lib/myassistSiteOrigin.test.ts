import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMyAssistAuthCallbackUrlForRequest, resolveMyAssistSiteOriginForRequest } from "./myassistSiteOrigin";

describe("resolveMyAssistSiteOriginForRequest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not prefer a sibling product URL in env when the browser host differs (forwarded host wins)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_URL", "https://bookiji.example.com");
    const req = new Request("https://any.internal/api", {
      headers: {
        "x-forwarded-host": "myassist.example.com",
        "x-forwarded-proto": "https",
      },
    });
    expect(resolveMyAssistSiteOriginForRequest(req)).toBe("https://myassist.example.com");
  });

  it("uses configured origin when host matches incoming (canonical scheme)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_URL", "https://myassist.example.com:443");
    const req = new Request("https://myassist.example.com/path", {
      headers: {
        "x-forwarded-host": "myassist.example.com",
        "x-forwarded-proto": "https",
      },
    });
    // `new URL(AUTH_URL).origin` drops the default :443 for https (see resolvePublicOrigin).
    expect(resolveMyAssistSiteOriginForRequest(req)).toBe("https://myassist.example.com");
  });

  it("buildMyAssistAuthCallbackUrlForRequest encodes a safe post-auth path", () => {
    const req = new Request("https://myassist.example.com/x");
    const url = buildMyAssistAuthCallbackUrlForRequest(req, "/inbox");
    expect(url).toBe("https://myassist.example.com/auth/callback?callbackUrl=%2Finbox");
  });
});
