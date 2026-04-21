"use client";

import { useState } from "react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [devHint, setDevHint] = useState<string | null>(null);

  return (
    <form
      className="mt-6"
      method="post"
      action="/api/auth/forgot-password"
      autoComplete="on"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        setDevResetUrl(null);
        setDevHint(null);
        try {
          const res = await fetch("/api/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          const data = (await res.json()) as { devResetUrl?: string; devHint?: string };
          setMessage("If this email exists, reset instructions were sent.");
          if (typeof data.devResetUrl === "string" && data.devResetUrl.trim()) {
            setDevResetUrl(data.devResetUrl);
          }
          if (typeof data.devHint === "string" && data.devHint.trim()) {
            setDevHint(data.devHint);
          }
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

      {message ? (
        <p className="theme-muted mt-4 text-sm" role="status" data-testid="success-message">
          {message}
        </p>
      ) : null}
      {devResetUrl ? (
        <a
          href={devResetUrl}
          className="mt-3 inline-block text-xs text-sky-300 underline underline-offset-2"
        >
          Open reset link (dev)
        </a>
      ) : null}
      {devHint ? <p className="mt-3 text-xs text-amber-300/90">{devHint}</p> : null}

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
