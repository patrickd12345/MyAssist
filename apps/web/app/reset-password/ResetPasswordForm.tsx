"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form
      className="mt-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setMessage(null);
        if (password.length < 8) {
          setMessage("Password must be at least 8 characters.");
          return;
        }
        if (password !== confirm) {
          setMessage("Passwords do not match.");
          return;
        }
        setBusy(true);
        try {
          const res = await fetch("/api/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, password }),
          });
          if (!res.ok) {
            const body = (await res.json()) as { error?: string };
            setMessage(body.error ?? "Could not reset password.");
            return;
          }
          setMessage("Password updated. Redirecting to sign in...");
          setTimeout(() => {
            router.push("/sign-in");
            router.refresh();
          }, 800);
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
          name="confirmPassword"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="theme-input mt-2 w-full rounded-2xl px-4 py-3 text-sm"
        />
      </label>

      {message ? (
        <p className="theme-muted mt-4 text-sm" role="status">
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
