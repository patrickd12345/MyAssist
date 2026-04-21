"use client";

import { useState } from "react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <form
      className="mt-6"
      method="post"
      action="/api/auth/forgot-password"
      autoComplete="on"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setSuccessMessage(null);
        setErrorMessage(null);
        try {
          const res = await fetch("/api/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          if (!res.ok) {
            const data = (await res.json()) as { error?: string };
            setErrorMessage(data.error ?? "Could not send reset instructions.");
            return;
          }
          setSuccessMessage("If this email exists, reset instructions were sent.");
        } catch {
          setErrorMessage("Could not send reset instructions.");
        } finally {
          setBusy(false);
        }
      }}
      noValidate
    >
      <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400" htmlFor="forgot-email">
        Email
        <input
          id="forgot-email"
          data-testid="email-input"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="theme-input mt-2 w-full rounded-2xl px-4 py-3 text-sm"
        />
      </label>

      {successMessage ? (
        <p className="theme-muted mt-4 text-sm" role="status" data-testid="success-message">
          {successMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mt-4 text-sm text-red-300" role="alert" data-testid="error-message">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        data-testid="reset-password-button"
        disabled={busy}
        className="theme-button-primary mt-6 w-full rounded-full px-5 py-3 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? "Sending..." : "Send reset link"}
      </button>
    </form>
  );
}
