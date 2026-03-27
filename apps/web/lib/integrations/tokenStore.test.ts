import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getIntegrationToken, listIntegrationStatuses, revokeIntegration, upsertIntegrationToken } from "./tokenStore";

describe("integration token store", () => {
  const userId = `test_${randomUUID()}`;

  afterEach(async () => {
    await revokeIntegration(userId, "gmail");
  });

  it("stores and retrieves encrypted provider tokens", async () => {
    await upsertIntegrationToken(userId, "gmail", {
      access_token: "token-1",
      refresh_token: "token-2",
      scope: "gmail.readonly",
      expires_at: Date.now() + 3600_000,
    });
    const token = await getIntegrationToken(userId, "gmail");
    expect(token?.access_token).toBe("token-1");
    expect(token?.refresh_token).toBe("token-2");
  });

  it("lists provider status and supports revocation", async () => {
    await upsertIntegrationToken(userId, "gmail", { access_token: "token-a" });
    let statuses = await listIntegrationStatuses(userId);
    expect(statuses.find((s) => s.provider === "gmail")?.status).toBe("connected");
    await revokeIntegration(userId, "gmail");
    statuses = await listIntegrationStatuses(userId);
    expect(statuses.find((s) => s.provider === "gmail")?.status).toBe("revoked");
  });
});
