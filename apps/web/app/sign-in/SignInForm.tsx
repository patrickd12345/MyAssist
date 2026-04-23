"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildMyAssistAuthCallbackUrl } from "@/lib/authPublicOrigin";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { safeInternalPath } from "@/lib/safeInternalPath";

const AUTH_ERROR_COPY: Record<string, string> = {
  missing_code: "The sign-in link was incomplete. Try again or request a new link.",
  auth_unavailable: "Sign-in is temporarily unavailable. Please try again later.",
  exchange_failed: "We could not complete sign-in. Try again.",
  session_failed: "We could not establish your session. Please sign in again.",
  account_link: "This email is already used with a different sign-in method. Use the same provider you used before.",
  bridge_failed: "We could not finish setting up the account. Please try again.",
};

function errorMessageFromParam(code: string | null): string | null {
  if (!code?.trim()) return null;
  if (Object.prototype.hasOwnProperty.call(AUTH_ERROR_COPY, code)) {
    return AUTH_ERROR_COPY[code] ?? null;
  }
  return "Sign-in could not be completed. Please try again.";
}

export function SignInForm() {
  const router = useRouter();
  const search = useSearchParams();
  const callbackPath = useMemo(() => safeInternalPath(search.get("callbackUrl")), [search]);
  const urlErrorCode = useMemo(() => search.get("error")?.trim() || null, [search]);

  const [pwMode, setPwMode] = useState<"sign-in" | "register">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const magicLinkInFlight = useRef(false);

  const oauthEnabled = {
    google: true,
    outlook: true,
  };

  useEffect(() => {
    if (!urlErrorCode) {
      setUrlError(null);
      return;
    }
    setUrlError(errorMessageFromParam(urlErrorCode) ?? "Sign-in could not be completed. Please try again.");
  }, [urlErrorCode]);

  const withSupabase = useCallback(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      throw new Error("Authentication is not configured.");
    }
    return supabase;
  }, []);

  const authCallbackTarget = useCallback(() => buildMyAssistAuthCallbackUrl(callbackPath), [callbackPath]);

  const runEnsureAppUser = useCallback(async (): Promise<{ ok: boolean; code?: string }> => {
    const res = await fetch("/api/auth/ensure-app-user", { method: "POST", cache: "no-store" });
    if (res.status === 401) {
      return { ok: false, code: "UNAUTHORIZED" };
    }
    const data = (await res.json()) as { ok: boolean; code?: string };
    return data;
  }, []);

  const onSendMagicLink = useCallback(async () => {
    if (magicLinkInFlight.current) return;
    magicLinkInFlight.current = true;
    setBusy(true);
    setMessage(null);
    setSuccess(null);
    setUrlError(null);
    try {
      const supabase = withSupabase();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: authCallbackTarget(),
          shouldCreateUser: true,
        },
      });
      if (error) {
        setMessage(error.message || "Could not send magic link.");
        return;
      }
      setSuccess("Magic link sent. Check your email to continue.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not send magic link.");
    } finally {
      magicLinkInFlight.current = false;
      setBusy(false);
    }
  }, [authCallbackTarget, email, withSupabase]);

  const onPasswordSubmit = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    setSuccess(null);
    setUrlError(null);
    try {
      const supabase = withSupabase();
      if (pwMode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: authCallbackTarget(),
          },
        });
        if (error) {
          setMessage(error.message || "Could not complete registration.");
          return;
        }
        if (!data.session) {
          setSuccess("Check your email to confirm your account, then sign in.");
          return;
        }
        const bridge = await runEnsureAppUser();
        if (!bridge.ok) {
          if (bridge.code === "EMAIL_CONFLICT") {
            setMessage("This email is already registered with a different sign-in method.");
            return;
          }
          if (bridge.code === "UNAUTHORIZED") {
            setMessage("Could not finish sign-in. Please try again.");
            return;
          }
          setMessage("We could not finish account setup. Please try again or contact support.");
          return;
        }
        router.push(callbackPath);
        router.refresh();
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setMessage("Invalid email or password.");
        return;
      }
      const bridge = await runEnsureAppUser();
      if (!bridge.ok) {
        if (bridge.code === "EMAIL_CONFLICT") {
          setMessage("This email is already linked to a different sign-in method.");
          return;
        }
        if (bridge.code === "UNAUTHORIZED") {
          setMessage("Could not finish sign-in. Please try again.");
          return;
        }
        setMessage("We could not finish account setup. Please try again.");
        return;
      }
      router.push(callbackPath);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, [authCallbackTarget, callbackPath, email, password, pwMode, router, runEnsureAppUser, withSupabase]);

  const onOAuthSignIn = useCallback(
    async (provider: "google" | "azure") => {
      setBusy(true);
      setMessage(null);
      setSuccess(null);
      setUrlError(null);
      try {
        const supabase = withSupabase();
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: authCallbackTarget(),
          },
        });
        if (error) {
          setMessage(
            `Failed to continue with ${provider === "azure" ? "Microsoft" : "Google"}.`,
          );
        }
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "OAuth sign-in failed.");
      } finally {
        setBusy(false);
      }
    },
    [authCallbackTarget, withSupabase],
  );

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-16">
      <div className="glass-panel-strong rounded-[28px] px-6 py-8 sm:px-8">
        <p className="theme-accent text-[11px] font-semibold uppercase tracking-[0.2em]">MyAssist</p>
        <h1 className="theme-ink mt-3 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="theme-muted mt-2 text-sm leading-relaxed">
          Supabase auth — set <code className="text-xs">NEXT_PUBLIC_SITE_URL</code> to the MyAssist public
          origin so magic links and OAuth return here, not a sibling app.
        </p>

        {urlError ? (
          <p className="theme-muted mt-4 text-sm text-amber-200/90" role="alert" data-testid="url-error">
            {urlError}
          </p>
        ) : null}

        {oauthEnabled.google || oauthEnabled.outlook ? (
          <div className="mt-6 space-y-3">
            {oauthEnabled.google ? (
              <button
                type="button"
                data-testid="oauth-google"
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
                data-testid="oauth-microsoft"
                disabled={busy}
                onClick={() => void onOAuthSignIn("azure")}
                className="theme-input w-full rounded-lg px-4 py-3 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
              >
                Continue with Microsoft
              </button>
            ) : null}
          </div>
        ) : null}

        <p className="theme-muted mt-8 text-center text-xs">Email and password</p>

        <form
          className="mt-2"
          method="post"
          action="#"
          autoComplete="on"
          onSubmit={(e) => {
            e.preventDefault();
            void onPasswordSubmit();
          }}
          noValidate
        >
          <div className="mb-4 flex gap-2 rounded-full bg-black/15 p-1">
            <button
              type="button"
              data-testid="pw-mode-sign-in"
              className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition ${
                pwMode === "sign-in" ? "theme-button-primary" : "theme-muted"
              }`}
              onClick={() => {
                setPwMode("sign-in");
                setMessage(null);
                setSuccess(null);
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              data-testid="pw-mode-register"
              className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition ${
                pwMode === "register" ? "theme-button-primary" : "theme-muted"
              }`}
              onClick={() => {
                setPwMode("register");
                setMessage(null);
                setSuccess(null);
              }}
            >
              Register
            </button>
          </div>

          <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400" htmlFor="pw-email">
            Email
            <input
              id="pw-email"
              data-testid="email-input"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="theme-input mt-2 w-full rounded-2xl px-4 py-3 text-sm"
            />
          </label>
          <label
            className="mt-4 block text-xs font-semibold uppercase tracking-wide text-zinc-400"
            htmlFor="pw-password"
          >
            Password
            <div className="relative mt-2">
              <input
                id="pw-password"
                data-testid="password-input"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={pwMode === "register" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="theme-input w-full rounded-2xl px-4 py-3 pr-12 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="theme-muted absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium transition hover:opacity-80"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {message ? (
            <p className="theme-muted mt-4 text-sm" role="alert" data-testid="error-message">
              {message}
            </p>
          ) : null}
          {success ? (
            <p className="theme-muted mt-4 text-sm text-emerald-400/90" role="status" data-testid="success-message">
              {success}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy || !email.trim() || !password}
            data-testid="submit-button"
            className="theme-button-primary mt-6 w-full rounded-full px-5 py-3 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Working…" : pwMode === "register" ? "Create account" : "Sign in"}
          </button>
          {pwMode === "sign-in" ? (
            <a
              href="/forgot-password"
              data-testid="forgot-password-link"
              className="theme-muted mt-4 inline-block text-xs underline underline-offset-2 transition hover:opacity-80"
            >
              Forgot password?
            </a>
          ) : null}
        </form>

        <p className="theme-muted mt-8 text-center text-xs">Or sign in with a magic link</p>
        <p className="theme-muted mt-1 text-center text-[11px]">
          A one-time link is sent to your email. Same email as above.
        </p>
        <button
          type="button"
          data-testid="magic-link-button"
          disabled={busy || !email.trim()}
          onClick={() => void onSendMagicLink()}
          className="theme-button-primary mt-4 w-full rounded-full px-5 py-3 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send magic link"}
        </button>
      </div>
    </div>
  );
}
