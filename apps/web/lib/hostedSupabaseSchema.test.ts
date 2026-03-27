import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("./supabaseAdmin", () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));
vi.mock("@/lib/supabaseAdmin", () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));

import { listIntegrationStatuses } from "./integrations/tokenStoreSupabase";
import {
  MYASSIST_APP_USERS_TABLE,
  MYASSIST_INTEGRATION_TOKENS_TABLE,
  MYASSIST_SCHEMA,
} from "./myassistSchema";
import { findUserByEmail } from "./userStoreSupabase";

describe("hosted Supabase schema qualification (myassist.*)", () => {
  beforeEach(() => {
    mocks.getSupabaseAdmin.mockReset();
  });

  it("findUserByEmail uses schema + app_users table", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const schemaMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle }),
        }),
      }),
    });
    mocks.getSupabaseAdmin.mockReturnValue({ schema: schemaMock } as never);

    await findUserByEmail("x@example.com");

    expect(schemaMock).toHaveBeenCalledWith(MYASSIST_SCHEMA);
    const fromMock = schemaMock.mock.results[0]!.value.from as ReturnType<typeof vi.fn>;
    expect(fromMock).toHaveBeenCalledWith(MYASSIST_APP_USERS_TABLE);
  });

  it("listIntegrationStatuses uses schema + integration_tokens table", async () => {
    const eqMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const schemaMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: eqMock,
        }),
      }),
    });
    mocks.getSupabaseAdmin.mockReturnValue({ schema: schemaMock } as never);

    const uid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    await listIntegrationStatuses(uid);

    expect(schemaMock).toHaveBeenCalledWith(MYASSIST_SCHEMA);
    const fromMock = schemaMock.mock.results[0]!.value.from as ReturnType<typeof vi.fn>;
    expect(fromMock).toHaveBeenCalledWith(MYASSIST_INTEGRATION_TOKENS_TABLE);
  });

});
