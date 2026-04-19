import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignInForm } from "../app/sign-in/SignInForm";

const signIn = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams("callbackUrl=/dashboard"),
}));

describe("SignInForm BKI-019 OAuth providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          credentials: { id: "credentials" },
          google: { id: "google" },
          "microsoft-entra-id": { id: "microsoft-entra-id" },
        }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows Google and Outlook buttons from configured Auth.js providers", async () => {
    render(<SignInForm />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue with Outlook" })).toBeInTheDocument();
    });
  });

  it("starts the selected Auth.js OAuth flow", async () => {
    render(<SignInForm />);

    await userEvent.click(await screen.findByRole("button", { name: "Continue with Outlook" }));

    expect(signIn).toHaveBeenCalledWith("microsoft-entra-id", { callbackUrl: "/dashboard" });
  });
});
