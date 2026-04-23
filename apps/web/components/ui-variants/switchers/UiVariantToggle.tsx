"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  parseUiVariant,
  UI_VARIANT_COOKIE_MAX_AGE_SECONDS,
  UI_VARIANT_COOKIE,
  UI_VARIANT_DEFAULT,
  UI_VARIANT_QUERY_PARAM,
  type UiVariant,
} from "@/lib/uiVariant";

function readVariantCookie(): UiVariant | null {
  if (typeof document === "undefined") return null;
  const pairs = document.cookie.split(";").map((p) => p.trim());
  const target = pairs.find((p) => p.startsWith(`${UI_VARIANT_COOKIE}=`));
  if (!target) return null;
  const value = decodeURIComponent(target.split("=")[1] ?? "");
  return parseUiVariant(value);
}

export function UiVariantToggle({ serverVariant }: { serverVariant: UiVariant }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [optimistic, setOptimistic] = useState<UiVariant | null>(null);

  const queryVariant = useMemo(() => parseUiVariant(search.get(UI_VARIANT_QUERY_PARAM)), [search]);
  const effectiveVariant = optimistic ?? queryVariant ?? readVariantCookie() ?? serverVariant ?? UI_VARIANT_DEFAULT;

  const nextVariant = effectiveVariant === "classic" ? "refactor" : "classic";
  const buttonLabel = effectiveVariant === "classic" ? "Classic UI" : "Refactor UI";

  const onToggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setOptimistic(nextVariant);
    try {
      const res = await fetch("/api/ui-variant", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ variant: nextVariant }),
      });
      if (!res.ok) {
        setOptimistic(null);
        return;
      }

      if (typeof document !== "undefined") {
        document.cookie = `${UI_VARIANT_COOKIE}=${encodeURIComponent(nextVariant)}; Path=/; Max-Age=${UI_VARIANT_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
      }

      const params = new URLSearchParams(search.toString());
      params.set(UI_VARIANT_QUERY_PARAM, nextVariant);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [busy, nextVariant, pathname, router, search]);

  return (
    <button
      type="button"
      onClick={() => void onToggle()}
      disabled={busy}
      className="ui-variant-toggle rounded-full border px-3 py-1.5 text-xs font-semibold"
      aria-label={`Switch UI variant. Current: ${buttonLabel}`}
      title={`Current: ${buttonLabel}`}
      data-testid="ui-variant-toggle"
    >
      {busy ? "Switching..." : buttonLabel}
    </button>
  );
}
