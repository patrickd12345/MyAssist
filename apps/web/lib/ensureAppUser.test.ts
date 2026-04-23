import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureAppUser } from "./ensureAppUser";
import type { User } from "@supabase/supabase-js";

const supabaseAdminMocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getSupabaseAdmin: supabaseAdminMocks.getSupabaseAdmin,
}));

vi.mock("@/lib/serverLog", () => ({
  logServerEvent: vi.fn(),
}));

const baseUser = (over: Partial<User> = {}): User =>
  ({
    id: "u1",
    email: "a@b.com",
    app_metadata: {},
    user_metadata: {},
    aud: "x",
    created_at: "x",
    ...over,
  }) as User;

type MaybeResult = { data: unknown; error: { message: string; code?: string } | null };

function adminFromIdEmailFlow(idQuery: MaybeResult, emailQuery: MaybeResult) {
  let idEq = 0;
  return {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => {
              idEq += 1;
              return idEq === 1 ? Promise.resolve(idQuery) : Promise.resolve(emailQuery);
            },
          }),
        }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        insert: () => Promise.resolve({ error: null }),
      }),
    }),
  };
}

function adminIdOnly(idQuery: MaybeResult) {
  return {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve(idQuery),
          }),
        }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        insert: () => Promise.resolve({ error: null }),
      }),
    }),
  };
}

function adminIdEmailInsert(
  idQuery: MaybeResult,
  emailQuery: MaybeResult,
  insertRes: { error: { message: string; code?: string } | null },
) {
  let selectEq = 0;
  return {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => {
              selectEq += 1;
              return selectEq === 1 ? Promise.resolve(idQuery) : Promise.resolve(emailQuery);
            },
          }),
        }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        insert: () => Promise.resolve(insertRes),
      }),
    }),
  };
}

function adminIdSelectErr(err: { message: string }) {
  return {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: err }),
          }),
        }),
      }),
    }),
  };
}

describe("ensureAppUser", () => {
  const { getSupabaseAdmin } = supabaseAdminMocks;
  afterEach(() => {
    getSupabaseAdmin.mockReset();
    vi.clearAllMocks();
  });

  it("returns UNAVAILABLE when admin client is missing", async () => {
    getSupabaseAdmin.mockReturnValue(null);
    const r = await ensureAppUser(baseUser());
    expect(r).toEqual({ ok: false, code: "UNAVAILABLE" });
  });

  it("returns MISSING_EMAIL when user has no email", async () => {
    getSupabaseAdmin.mockReturnValue({ schema: () => ({ from: () => ({}) }) });
    const r = await ensureAppUser(baseUser({ email: undefined }));
    expect(r).toEqual({ ok: false, code: "MISSING_EMAIL" });
  });

  it("returns ok when row exists for same id and email", async () => {
    getSupabaseAdmin.mockReturnValue(
      adminIdOnly({ data: { id: "u1", email: "a@b.com" }, error: null }),
    );
    const r = await ensureAppUser(baseUser());
    expect(r).toEqual({ ok: true });
  });

  it("returns ok idempotently on insert race 23505", async () => {
    getSupabaseAdmin.mockReturnValue(
      adminIdEmailInsert(
        { data: null, error: null },
        { data: null, error: null },
        { error: { message: "dup", code: "23505" } },
      ),
    );
    const r = await ensureAppUser(baseUser());
    expect(r).toEqual({ ok: true });
  });

  it("returns EMAIL_CONFLICT when another id owns the email", async () => {
    getSupabaseAdmin.mockReturnValue(
      adminFromIdEmailFlow(
        { data: null, error: null },
        { data: { id: "other", email: "a@b.com" }, error: null },
      ),
    );
    const r = await ensureAppUser(baseUser({ id: "u1" }));
    expect(r).toEqual({ ok: false, code: "EMAIL_CONFLICT" });
  });

  it("returns DB_ERROR on first select failure", async () => {
    getSupabaseAdmin.mockReturnValue(adminIdSelectErr({ message: "db" }));
    const r = await ensureAppUser(baseUser());
    expect(r).toEqual({ ok: false, code: "DB_ERROR" });
  });
});
