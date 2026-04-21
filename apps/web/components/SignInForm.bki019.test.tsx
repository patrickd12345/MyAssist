import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignInForm } from "../app/sign-in/SignInForm";

const push = vi.fn();
const refresh = vi.fn();
const signInWithOAuth = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams("callbackUrl=/dashboard"),
}));

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signInWithOAuth,
    },
  }),
}));

describe("SignInForm BKI-019 OAuth providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInWithOAuth.mockResolvedValue({ data: {}, error: null });
  });

  it("shows Google and Outlook buttons", async () => {
    render(<SignInForm />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue with Outlook" })).toBeInTheDocument();
    });
  });

  it("starts Supabase OAuth flow", async () => {
    render(<SignInForm />);

    const buttons = await screen.findAllByRole("button", { name: "Continue with Outlook" });
    await userEvent.click(buttons[0]);

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "azure",
      options: { redirectTo: "http://localhost:3000/dashboard" },
    });
  });
});
