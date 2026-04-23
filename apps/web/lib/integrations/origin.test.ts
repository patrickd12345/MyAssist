import { describe, expect, it, vi } from "vitest";
import { resolvePublicOrigin } from "./origin";

describe("resolvePublicOrigin", () => {
  it("uses x-forwarded-host when no AUTH_URL (production)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_URL", undefined);
    vi.stubEnv("NEXTAUTH_URL", undefined);
    vi.stubEnv("MYASSIST_PUBLIC_APP_URL", undefined);

    const req = new Request("http://127.0.0.1:3000/api/integrations/google_calendar/connect", {
      headers: {
        "x-forwarded-host": "myassist.bookiji.com",
        "x-forwarded-proto": "https",
      },
    });
    expect(resolvePublicOrigin(req)).toBe("https://myassist.bookiji.com");
    vi.unstubAllEnvs();
  });

  it("trusts forwarded host over mismatched AUTH_URL in production (avoids stale cross-product URL)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_URL", "https://myassist.bookiji.com");

    const req = new Request("http://internal/api/x", {
      headers: {
        "x-forwarded-host": "other.example.com",
        "x-forwarded-proto": "https",
      },
    });
    expect(resolvePublicOrigin(req)).toBe("https://other.example.com");
    vi.unstubAllEnvs();
  });
});
