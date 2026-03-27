/**
 * Optional live check against Bookiji Production (or any Supabase with myassist.*).
 * Run from apps/web with env loaded, e.g.:
 *   RUN_MYASSIST_HOSTED_SMOKE=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/hostedRuntimeSmoke.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  getIntegrationToken,
  listIntegrationStatuses,
  upsertIntegrationToken,
} from "./integrations/tokenStore";
import { isSupabaseHostedStorageEnabled } from "./supabaseAdmin";
import { createUser, findUserByEmail } from "./userStore";

const hostedSmokeEnabled =
  process.env.RUN_MYASSIST_HOSTED_SMOKE === "1" && isSupabaseHostedStorageEnabled();

describe.skipIf(!hostedSmokeEnabled)("hosted runtime smoke (real Supabase)", () => {
  it("user + integration round-trip via myassist schema", async () => {
    const email = `hosted-smoke-${Date.now()}@example.com`;
    const password = "HostedSmoke-Pass-123456";

    const created = await createUser({ email, password });
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const found = await findUserByEmail(email);
    expect(found?.id).toBe(created.id);
    expect(found?.email).toBe(email);

    await upsertIntegrationToken(created.id, "todoist", {
      access_token: "hosted-smoke-token",
      token_type: "Bearer",
    });

    const tok = await getIntegrationToken(created.id, "todoist");
    expect(tok?.access_token).toBe("hosted-smoke-token");

    const statuses = await listIntegrationStatuses(created.id);
    const todoist = statuses.find((s) => s.provider === "todoist");
    expect(todoist?.status).toBe("connected");
  });
});
