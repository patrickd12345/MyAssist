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

  const [oauthProviders, setOauthProviders] = useState<{ google?: string; outlook?: string }>({});
  const [mode, setMode] = useState<"sign-in" | "register">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/providers")
      .then((res) => (res.ok ? res.json() : null))
      .then((providers: unknown) => {
        if (!active || !providers || typeof providers !== "object") return;
        const providerMap = providers as Record<string, { id?: string } | undefined>;
        setOauthProviders({
          google: providerMap.google?.id,
          outlook: providerMap["microsoft-entra-id"]?.id ?? providerMap["azure-ad"]?.id,
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

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

  const onOAuthSignIn = useCallback(
    async (providerId: string) => {
      setBusy(true);
      setMessage(null);
      try {
        await signIn(providerId, { callbackUrl });
      } finally {
        setBusy(false);
      }
    },
    [callbackUrl],
  );

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

        {oauthProviders.google || oauthProviders.outlook ? (
          <div className="mt-6 space-y-3">
            {oauthProviders.google ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onOAuthSignIn(oauthProviders.google as string)}
                className="theme-input w-full rounded-lg px-4 py-3 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
              >
                Continue with Google
              </button>
            ) : null}
            {oauthProviders.outlook ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onOAuthSignIn(oauthProviders.outlook as string)}
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
          action={mode === "register" ? "/api/auth/register" : "/api/auth/callback/credentials"}
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
          {mode === "sign-in" ? (
            <a
              href="/forgot-password"
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
