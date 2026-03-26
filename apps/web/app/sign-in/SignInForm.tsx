"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

function SignInFormSkeleton() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-16">
      <div className="glass-panel-strong rounded-[28px] px-6 py-8 sm:px-8">
        <p className="theme-accent text-[11px] font-semibold uppercase tracking-[0.2em]">MyAssist</p>
        <div className="theme-ink mt-3 h-8 max-w-[12rem] animate-pulse rounded-lg bg-white/10" aria-hidden />
        <div className="theme-muted mt-2 h-10 max-w-full animate-pulse rounded-lg bg-white/5" aria-hidden />
        <div className="mt-6 flex gap-2 rounded-full bg-black/20 p-1">
          <div className="h-9 flex-1 animate-pulse rounded-full bg-white/10" aria-hidden />
          <div className="h-9 flex-1 animate-pulse rounded-full bg-white/5" aria-hidden />
        </div>
        <div className="mt-6 h-24 animate-pulse rounded-2xl bg-white/5" aria-hidden />
        <div className="mt-4 h-24 animate-pulse rounded-2xl bg-white/5" aria-hidden />
        <div className="mt-6 h-12 animate-pulse rounded-full bg-white/10" aria-hidden />
      </div>
    </div>
  );
}

export function SignInForm() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <SignInFormSkeleton />;
  }

  return <SignInFormFields />;
}

function SignInFormFields() {
  const router = useRouter();
  const search = useSearchParams();
  const callbackUrl = search.get("callbackUrl")?.trim() || "/";

  const [mode, setMode] = useState<"sign-in" | "register">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onRegister = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Could not complete registration.");
        return;
      }
      setMessage("Account created. Signing in...");
      const signInResult = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });
      if (signInResult && "ok" in signInResult && signInResult.ok === false) {
        setMessage("Registered. Please sign in.");
        setMode("sign-in");
        return;
      }
      if (signInResult?.error) {
        setMessage("Registered. Please sign in.");
        setMode("sign-in");
        return;
      }
      router.push(callbackUrl.startsWith("/") ? callbackUrl : "/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [callbackUrl, email, password, router]);

  const onSignIn = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });
      if (result && "ok" in result && result.ok === false) {
        setMessage("Invalid email or password.");
        return;
      }
      if (result?.error) {
        setMessage("Invalid email or password.");
        return;
      }
      router.push(callbackUrl.startsWith("/") ? callbackUrl : "/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [callbackUrl, email, password, router]);

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-16">
      <div className="glass-panel-strong rounded-[28px] px-6 py-8 sm:px-8">
        <p className="theme-accent text-[11px] font-semibold uppercase tracking-[0.2em]">MyAssist</p>
        <h1 className="theme-ink mt-3 text-2xl font-semibold tracking-tight">
          {mode === "sign-in" ? "Sign in" : "Create account"}
        </h1>
        <p className="theme-muted mt-2 text-sm leading-relaxed">
          Personal workspace access. Credentials stay on this machine in a local user file.
        </p>

        <div className="mt-6 flex gap-2 rounded-full bg-black/20 p-1">
          <button
            type="button"
            className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition ${
              mode === "sign-in" ? "theme-button-primary" : "theme-muted"
            }`}
            onClick={() => {
              setMode("sign-in");
              setMessage(null);
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition ${
              mode === "register" ? "theme-button-primary" : "theme-muted"
            }`}
            onClick={() => {
              setMode("register");
              setMessage(null);
            }}
          >
            Register
          </button>
        </div>

        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            void (mode === "register" ? onRegister() : onSignIn());
          }}
          noValidate
        >
          <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400" htmlFor="sign-in-email">
            Email
            <input
              id="sign-in-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="theme-input mt-2 w-full rounded-2xl px-4 py-3 text-sm"
            />
          </label>

          <label
            className="mt-4 block text-xs font-semibold uppercase tracking-wide text-zinc-400"
            htmlFor="sign-in-password"
          >
            Password
            <input
              id="sign-in-password"
              name="password"
              type="password"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            {busy ? "Working..." : mode === "register" ? "Create account" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
