"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

function safeInternalPath(raw: string | null | undefined): string {
  const trimmed = raw?.trim() ?? "";
  return trimmed.startsWith("/") ? trimmed : "/";
}

function absoluteRedirect(pathname: string): string {
  if (typeof window === "undefined") return pathname;
  return new URL(pathname, window.location.origin).toString();
}

export function SignInForm() {
  const router = useRouter();
  const search = useSearchParams();
  const callbackPath = useMemo(() => safeInternalPath(search.get("callbackUrl")), [search]);

  const [mode, setMode] = useState<"sign-in" | "register">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const oauthEnabled = {
    google: true,
    outlook: true,
  };

  const withSupabase = useCallback(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      throw new Error("Authentication is not configured.");
    }
    return supabase;
  }, []);

  const onRegister = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const supabase = withSupabase();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: absoluteRedirect(callbackPath),
        },
      });
      if (error) {
        setMessage("Could not complete registration.");
        return;
      }
      if (!data.session) {
        setMessage("Account created. Check your email to confirm and sign in.");
        setMode("sign-in");
        return;
      }
      router.push(callbackPath);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not complete registration.");
    } finally {
      setBusy(false);
    }
  }, [callbackPath, email, password, router, withSupabase]);

  const onSignIn = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const supabase = withSupabase();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setMessage("Invalid email or password.");
        return;
      }
      router.push(callbackPath);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Invalid email or password.");
    } finally {
      setBusy(false);
    }
  }, [callbackPath, email, password, router, withSupabase]);

  const onOAuthSignIn = useCallback(
    async (provider: "google" | "azure") => {
      setBusy(true);
      setMessage(null);
      try {
        const supabase = withSupabase();
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: absoluteRedirect(callbackPath),
          },
        });
        if (error) {
          setMessage(`Failed to continue with ${provider === "azure" ? "Outlook" : "Google"}.`);
        }
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "OAuth sign-in failed.");
      } finally {
        setBusy(false);
      }
    },
    [callbackPath, withSupabase],
  );

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-16">
      <div className="glass-panel-strong rounded-[28px] px-6 py-8 sm:px-8">
        <p className="theme-accent text-[11px] font-semibold uppercase tracking-[0.2em]">MyAssist</p>
        <h1 className="theme-ink mt-3 text-2xl font-semibold tracking-tight">
          {mode === "sign-in" ? "Sign in" : "Create account"}
        </h1>
        <p className="theme-muted mt-2 text-sm leading-relaxed">Personal workspace access powered by Supabase Auth.</p>

        {oauthEnabled.google || oauthEnabled.outlook ? (
          <div className="mt-6 space-y-3">
            {oauthEnabled.google ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onOAuthSignIn("google")}
                className="theme-input w-full rounded-lg px-4 py-3 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
              >
                Continue with Google
              </button>
            ) : null}
            {oauthEnabled.outlook ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onOAuthSignIn("azure")}
                className="theme-input w-full rounded-lg px-4 py-3 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
              >
                Continue with Outlook
              </button>
            ) : null}
            <p className="theme-muted text-center text-xs">or use email</p>
          </div>
        ) : null}

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
          method="post"
          action="#"
          autoComplete="on"
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

          <label
            className="mt-4 block text-xs font-semibold uppercase tracking-wide text-zinc-400"
            htmlFor="sign-in-password"
          >
            Password
            <div className="relative mt-2">
              <input
                id="sign-in-password"
                data-testid="password-input"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
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

          {message ? (
            <p className="theme-muted mt-4 text-sm" role="status" data-testid="error-message">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            data-testid="submit-button"
            className="theme-button-primary mt-6 w-full rounded-full px-5 py-3 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Working..." : mode === "register" ? "Create account" : "Sign in"}
          </button>
          {mode === "sign-in" ? (
            <a
              href="/forgot-password"
              data-testid="forgot-password-link"
              className="theme-muted mt-4 inline-block text-xs underline underline-offset-2 transition hover:opacity-80"
            >
              Forgot password?
            </a>
          ) : null}
        </form>
      </div>
    </div>
  );
}
