import { describe, expect, it } from "vitest";
import { resolvePublicOrigin } from "./origin";

describe("resolvePublicOrigin", () => {
  it("uses x-forwarded-host when no AUTH_URL (production)", () => {
    const prev = process.env.NODE_ENV;
    const prevAuth = process.env.AUTH_URL;
    // @ts-expect-error test
    process.env.NODE_ENV = "production";
    delete process.env.AUTH_URL;
    delete process.env.NEXTAUTH_URL;
    delete process.env.MYASSIST_PUBLIC_APP_URL;

    const req = new Request("http://127.0.0.1:3000/api/integrations/google_calendar/connect", {
      headers: {
        "x-forwarded-host": "myassist.bookiji.com",
        "x-forwarded-proto": "https",
      },
    });
    expect(resolvePublicOrigin(req)).toBe("https://myassist.bookiji.com");

    // @ts-expect-error test
    process.env.NODE_ENV = prev;
    if (prevAuth !== undefined) process.env.AUTH_URL = prevAuth;
  });

  it("prefers AUTH_URL over forwarded when set (production)", () => {
    const prev = process.env.NODE_ENV;
    const prevAuth = process.env.AUTH_URL;
    // @ts-expect-error test
    process.env.NODE_ENV = "production";
    process.env.AUTH_URL = "https://myassist.bookiji.com";

    const req = new Request("http://internal/api/x", {
      headers: {
        "x-forwarded-host": "other.example.com",
        "x-forwarded-proto": "https",
      },
    });
    expect(resolvePublicOrigin(req)).toBe("https://myassist.bookiji.com");

    // @ts-expect-error test
    process.env.NODE_ENV = prev;
    if (prevAuth !== undefined) process.env.AUTH_URL = prevAuth;
    else delete process.env.AUTH_URL;
  });
});
