import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/demo-script", () => {
  it("returns JSON walkthrough", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { title: string; steps: unknown[] };
    expect(json.title).toBe("MyAssist Demo Walkthrough");
    expect(Array.isArray(json.steps)).toBe(true);
    expect(json.steps.length).toBe(6);
  });
});
