import { describe, expect, it } from "vitest";
import { resolveMyAssistAuthRedirectOrigin } from "./authPublicOrigin";

describe("resolveMyAssistAuthRedirectOrigin", () => {
  it("forces MyAssist canonical host for Bookiji-host auth starts when no config is provided", () => {
    const origin = resolveMyAssistAuthRedirectOrigin({
      windowOrigin: "https://app.bookiji.com",
      configuredSiteUrl: "",
    });
    expect(origin).toBe("https://myassist.bookiji.com");
  });

  it("drops non-MyAssist configured URL on shared Bookiji host", () => {
    const origin = resolveMyAssistAuthRedirectOrigin({
      windowOrigin: "https://app.bookiji.com",
      configuredSiteUrl: "https://app.bookiji.com",
    });
    expect(origin).toBe("https://myassist.bookiji.com");
  });

  it("accepts MyAssist configured URL on shared Bookiji host", () => {
    const origin = resolveMyAssistAuthRedirectOrigin({
      windowOrigin: "https://app.bookiji.com",
      configuredSiteUrl: "https://myassist.bookiji.com",
    });
    expect(origin).toBe("https://myassist.bookiji.com");
  });

  it("rejects cross-origin configured URLs for non-Bookiji hosts", () => {
    const origin = resolveMyAssistAuthRedirectOrigin({
      windowOrigin: "http://localhost:3000",
      configuredSiteUrl: "https://myassist.bookiji.com",
    });
    expect(origin).toBe("http://localhost:3000");
  });

  it("keeps same-origin configured URL for non-Bookiji hosts", () => {
    const origin = resolveMyAssistAuthRedirectOrigin({
      windowOrigin: "http://localhost:3000",
      configuredSiteUrl: "http://localhost:3000",
    });
    expect(origin).toBe("http://localhost:3000");
  });
});
