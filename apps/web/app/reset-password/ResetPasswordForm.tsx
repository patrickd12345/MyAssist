"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ResetPasswordForm({ code }: { code: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form
      className="mt-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setMessage(null);
        setIsError(false);
        if (password.length < 8) {
          setMessage("Password must be at least 8 characters.");
          setIsError(true);
          return;
        }
        if (password !== confirm) {
          setMessage("Passwords do not match.");
          setIsError(true);
          return;
        }
        setBusy(true);
        try {
          const res = await fetch("/api/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, password }),
          });
          if (!res.ok) {
            const body = (await res.json()) as { error?: string };
            setMessage(body.error ?? "Could not reset password.");
            setIsError(true);
            return;
          }
          setMessage("Password updated. Redirecting to sign in...");
          setIsError(false);
          setTimeout(() => {
            router.push("/sign-in");
            router.refresh();
          }, 800);
        } catch {
          setMessage("Could not reset password.");
          setIsError(true);
        } finally {
          setBusy(false);
        }
      }}
      noValidate
    >
      <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400" htmlFor="reset-password">
        New password
        <div className="relative mt-2">
          <input
            id="reset-password"
            data-testid="new-password-input"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="theme-input w-full rounded-2xl px-4 py-3 pr-12 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="theme-muted absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium transition hover:opacity-80"
            aria-label={showPassword ? "Hide password" : "Show password"}
            title={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </label>

      <label
        className="mt-4 block text-xs font-semibold uppercase tracking-wide text-zinc-400"
        htmlFor="reset-password-confirm"
      >
        Confirm password
        <input
          id="reset-password-confirm"
          data-testid="confirm-password-input"
          name="confirmPassword"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="theme-input mt-2 w-full rounded-2xl px-4 py-3 text-sm"
        />
      </label>

      {message ? (
        <p
          className={`mt-4 text-sm ${isError ? "text-red-300" : "theme-muted"}`}
          role={isError ? "alert" : "status"}
          data-testid={isError ? "error-message" : "success-message"}
        >
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="theme-button-primary mt-6 w-full rounded-full px-5 py-3 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? "Updating..." : "Reset password"}
      </button>
    </form>
  );
}
