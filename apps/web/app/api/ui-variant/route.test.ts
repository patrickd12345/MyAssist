import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/ui-variant", () => {
  it("persists valid ui variant", async () => {
    const req = new Request("http://localhost:3000/api/ui-variant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ variant: "refactor" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; variant: string };
    expect(data.ok).toBe(true);
    expect(data.variant).toBe("refactor");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("myassist_ui_variant=refactor");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
  });

  it("rejects invalid variant", async () => {
    const req = new Request("http://localhost:3000/api/ui-variant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ variant: "new-ui" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects invalid json", async () => {
    const req = new Request("http://localhost:3000/api/ui-variant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{bad-json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
