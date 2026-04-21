"use client";

import { createBrowserClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey: string | null = null;

function resolveBrowserSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
}

function resolveBrowserSupabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ??
    ""
  );
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const url = resolveBrowserSupabaseUrl();
  const key = resolveBrowserSupabaseAnonKey();
  if (!url || !key) {
    cachedClient = null;
    cachedConfigKey = null;
    return null;
  }

  const configKey = `${url}\n${key}`;
  if (!cachedClient || cachedConfigKey !== configKey) {
    cachedClient = createBrowserClient(url, key, {
      cookies: {
        get(name: string) {
          if (typeof document === "undefined") return undefined;
          const parts = document.cookie.split("; ");
          const pair = parts.find((entry) => entry.startsWith(`${name}=`));
          return pair ? decodeURIComponent(pair.slice(name.length + 1)) : undefined;
        },
        set(name: string, value: string, options: CookieOptions) {
          if (typeof document === "undefined") return;
          const segments = [`${name}=${encodeURIComponent(value)}`];
          if (options.maxAge) segments.push(`Max-Age=${options.maxAge}`);
          if (options.domain) segments.push(`Domain=${options.domain}`);
          if (options.path) segments.push(`Path=${options.path}`);
          if (options.sameSite) segments.push(`SameSite=${options.sameSite}`);
          if (options.secure) segments.push("Secure");
          document.cookie = segments.join("; ");
        },
        remove(name: string, options: CookieOptions) {
          if (typeof document === "undefined") return;
          const segments = [`${name}=`, "Max-Age=0"];
          if (options.domain) segments.push(`Domain=${options.domain}`);
          if (options.path) segments.push(`Path=${options.path}`);
          document.cookie = segments.join("; ");
        },
      },
    });
    cachedConfigKey = configKey;
  }

  return cachedClient;
}
