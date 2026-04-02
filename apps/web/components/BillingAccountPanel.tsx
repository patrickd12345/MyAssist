"use client";

import { useCallback, useEffect, useState } from "react";

type ApiErr = { message?: string; code?: string };

function readErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const o = body as ApiErr;
  if (typeof o.message === "string" && o.message.trim()) return o.message;
  if (typeof o.code === "string" && o.code.trim()) return o.code;
  return fallback;
}

/**
 * Shown only when server reports billing is enabled (`GET /api/billing/status`).
 * Uses existing checkout + portal routes; no second webhook.
 */
export function BillingAccountPanel() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/billing/status")
      .then((r) => r.json())
      .then((j: { enabled?: boolean }) => {
        if (!cancelled && j?.enabled === true) setVisible(true);
      })
      .catch(() => {
        if (!cancelled) setVisible(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const startCheckout = useCallback(async () => {
    setBusy("checkout");
    setError(null);
    try {
      const origin = window.location.origin;
      const res = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          successUrl: `${origin}/?billing=success`,
          cancelUrl: `${origin}/?billing=cancel`,
        }),
      });
      const body: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(readErrorMessage(body, `Checkout failed (${res.status})`));
      }
      const url = typeof (body as { url?: unknown }).url === "string" ? (body as { url: string }).url : "";
      if (!url) throw new Error("No checkout URL returned");
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setBusy(null);
    }
  }, []);

  const openPortal = useCallback(async () => {
    setBusy("portal");
    setError(null);
    try {
      const origin = window.location.origin;
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl: `${origin}/` }),
      });
      const body: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(readErrorMessage(body, `Portal failed (${res.status})`));
      }
      const url = typeof (body as { url?: unknown }).url === "string" ? (body as { url: string }).url : "";
      if (!url) throw new Error("No portal URL returned");
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Portal failed");
    } finally {
      setBusy(null);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="w-full max-w-md rounded-[20px] border border-white/12 bg-white/[0.04] px-4 py-3 xl:max-w-none">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Subscription</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void startCheckout()}
          disabled={busy !== null}
          className="theme-button-primary rounded-full px-4 py-2 text-xs font-semibold transition disabled:opacity-50"
        >
          {busy === "checkout" ? "Opening…" : "Subscribe / upgrade"}
        </button>
        <button
          type="button"
          onClick={() => void openPortal()}
          disabled={busy !== null}
          className="theme-button-secondary rounded-full px-4 py-2 text-xs font-semibold transition disabled:opacity-50"
        >
          {busy === "portal" ? "Opening…" : "Manage billing"}
        </button>
      </div>
      {error ? (
        <p className="theme-muted mt-2 text-xs leading-relaxed" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
