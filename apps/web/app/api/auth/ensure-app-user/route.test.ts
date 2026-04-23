import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "./route";

const getSupabaseServerUser = vi.fn();
const ensureAppUser = vi.fn();

vi.mock("@/lib/supabaseServer", () => ({
  getSupabaseServerUser: () => getSupabaseServerUser(),
}));

vi.mock("@/lib/ensureAppUser", () => ({
  ensureAppUser: (...a: unknown[]) => ensureAppUser(...a),
}));

describe("POST /api/auth/ensure-app-user", () => {
  beforeEach(() => {
    getSupabaseServerUser.mockReset();
    ensureAppUser.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session user", async () => {
    getSupabaseServerUser.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns ok when ensureAppUser succeeds", async () => {
    getSupabaseServerUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    ensureAppUser.mockResolvedValue({ ok: true });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("returns body with code on conflict", async () => {
    getSupabaseServerUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    ensureAppUser.mockResolvedValue({ ok: false, code: "EMAIL_CONFLICT" });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; code: string };
    expect(body).toEqual({ ok: false, code: "EMAIL_CONFLICT" });
  });
});
