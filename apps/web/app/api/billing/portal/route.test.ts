import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSessionUserId = vi.hoisted(() => vi.fn());
const mockCreateBillingPortalSession = vi.hoisted(() => vi.fn(async () => "http://portal.test"));
const mockGetSupabaseAdmin = vi.hoisted(() =>
  vi.fn(() => ({
    schema: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { stripe_customer_id: "cus_x" }, error: null })),
          })),
        })),
      })),
    })),
  })),
);

vi.mock("@/lib/session", () => ({
  getSessionUserId: mockGetSessionUserId,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getSupabaseAdmin: mockGetSupabaseAdmin,
}));

vi.mock("@/lib/services/stripeBilling", () => ({
  createBillingPortalSession: mockCreateBillingPortalSession,
}));

describe("POST /api/billing/portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BILLING_ENABLED = "true";
  });

  it("returns 401 when no user", async () => {
    mockGetSessionUserId.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/billing/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ returnUrl: "https://return" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when no stripe customer on file", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    mockGetSupabaseAdmin.mockReturnValueOnce({
      schema: vi.fn(() => ({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { stripe_customer_id: null }, error: null })),
            })),
          })),
        })),
      })),
    } as never);
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/billing/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ returnUrl: "https://return" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns portal url when customer exists", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/billing/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ returnUrl: "https://return" }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string };
    expect(json.url).toBe("http://portal.test");
  });
});
