import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertSafeN8nWebhookUrl } from "./n8nWebhookUrl";

describe("assertSafeN8nWebhookUrl", () => {
  let savedN8n: string | undefined;

  beforeEach(() => {
    savedN8n = process.env.MYASSIST_N8N_WEBHOOK_URL;
  });

  afterEach(() => {
    if (savedN8n === undefined) delete process.env.MYASSIST_N8N_WEBHOOK_URL;
    else process.env.MYASSIST_N8N_WEBHOOK_URL = savedN8n;
  });

  it("rejects loopback IPv4 literals when not in development", async () => {
    await expect(assertSafeN8nWebhookUrl("http://127.0.0.1/webhook")).rejects.toThrow(/private/);
  });

  it("allows loopback when MYASSIST_ALLOW_LOCAL_N8N_WEBHOOK is set (same bypass as next dev)", async () => {
    const prev = process.env.MYASSIST_ALLOW_LOCAL_N8N_WEBHOOK;
    process.env.MYASSIST_ALLOW_LOCAL_N8N_WEBHOOK = "true";
    try {
      await expect(assertSafeN8nWebhookUrl("http://127.0.0.1/webhook")).resolves.toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.MYASSIST_ALLOW_LOCAL_N8N_WEBHOOK;
      else process.env.MYASSIST_ALLOW_LOCAL_N8N_WEBHOOK = prev;
    }
  });

  it("allows public https URLs for example.com", async () => {
    await expect(assertSafeN8nWebhookUrl("https://example.com/webhook/foo")).resolves.toBeUndefined();
  });

  it("rejects per-user override when env origin is unset", async () => {
    delete process.env.MYASSIST_N8N_WEBHOOK_URL;
    await expect(
      assertSafeN8nWebhookUrl("https://example.com/hook", { webhookUrl: "https://example.com/hook" }),
    ).rejects.toThrow(/MYASSIST_N8N_WEBHOOK_URL/);
  });

  it("allows per-user path on same origin as env", async () => {
    process.env.MYASSIST_N8N_WEBHOOK_URL = "https://example.com/base";
    await expect(
      assertSafeN8nWebhookUrl("https://example.com/other/path", { webhookUrl: "https://example.com/other/path" }),
    ).resolves.toBeUndefined();
  });

  it("rejects per-user override on different origin than env", async () => {
    process.env.MYASSIST_N8N_WEBHOOK_URL = "https://example.com/base";
    await expect(
      assertSafeN8nWebhookUrl("https://evil.example/webhook", { webhookUrl: "https://evil.example/webhook" }),
    ).rejects.toThrow(/match the origin/);
  });
});
