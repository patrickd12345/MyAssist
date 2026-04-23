import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignInForm } from "../app/sign-in/SignInForm";

const signInWithOAuth = vi.fn();
const signInWithOtp = vi.fn();
const signInWithPassword = vi.fn();
const signUp = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams("callbackUrl=/dashboard"),
}));

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signInWithOtp,
      signInWithOAuth,
      signInWithPassword,
      signUp,
    },
  }),
}));

describe("SignInForm BKI-019 OAuth providers", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    signInWithOtp.mockResolvedValue({ data: {}, error: null });
  });

  it("shows Google and Microsoft buttons", async () => {
    render(<SignInForm />);

    await waitFor(() => {
      expect(screen.getByTestId("oauth-google")).toBeInTheDocument();
      expect(screen.getByTestId("oauth-microsoft")).toBeInTheDocument();
    });
  });

  it("starts Supabase OAuth flow with auth callback redirect", async () => {
    render(<SignInForm />);

    const btn = await screen.findByTestId("oauth-microsoft");
    await userEvent.click(btn);

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "azure",
      options: {
        redirectTo: "http://localhost:3000/auth/callback?callbackUrl=%2Fdashboard",
      },
    });
  });

  it("sends magic link with emailRedirectTo pointing at auth callback", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    render(<SignInForm />);

    await userEvent.type(screen.getByTestId("email-input"), "user@example.com");
    await userEvent.click(screen.getByTestId("magic-link-button"));

    await waitFor(() => {
      expect(signInWithOtp).toHaveBeenCalledWith({
        email: "user@example.com",
        options: {
          emailRedirectTo: "http://localhost:3000/auth/callback?callbackUrl=%2Fdashboard",
          shouldCreateUser: true,
        },
      });
    });
  });
});
