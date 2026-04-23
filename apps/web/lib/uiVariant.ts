import type { NextRequest, NextResponse } from "next/server";

export type UiVariant = "classic" | "refactor";

export const UI_VARIANT_COOKIE = "myassist_ui_variant";
export const UI_VARIANT_QUERY_PARAM = "ui";
export const UI_VARIANT_DEFAULT: UiVariant = "classic";
export const UI_VARIANT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function isValidUiVariant(value: unknown): value is UiVariant {
  return value === "classic" || value === "refactor";
}

export function parseUiVariant(value: unknown): UiVariant | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isValidUiVariant(normalized) ? normalized : null;
}

export function resolveUiVariantFromSearchParams(
  searchParams: URLSearchParams | Record<string, string | string[] | undefined> | null | undefined,
): UiVariant | null {
  if (!searchParams) return null;
  if (searchParams instanceof URLSearchParams) {
    return parseUiVariant(searchParams.get(UI_VARIANT_QUERY_PARAM));
  }
  const value = searchParams[UI_VARIANT_QUERY_PARAM];
  if (Array.isArray(value)) return parseUiVariant(value[0]);
  return parseUiVariant(value);
}

export function resolveUiVariantFromCookies(
  cookieStore:
    | {
        get(name: string): { value: string } | undefined;
      }
    | null
    | undefined,
): UiVariant | null {
  if (!cookieStore) return null;
  return parseUiVariant(cookieStore.get(UI_VARIANT_COOKIE)?.value);
}

export async function resolveUiVariantForServerPage(args: {
  searchParams?: URLSearchParams | Record<string, string | string[] | undefined> | null;
  cookieStore?:
    | {
        get(name: string): { value: string } | undefined;
      }
    | null;
}): Promise<UiVariant> {
  const fromQuery = resolveUiVariantFromSearchParams(args.searchParams);
  if (fromQuery) return fromQuery;
  const fromCookie = resolveUiVariantFromCookies(args.cookieStore);
  if (fromCookie) return fromCookie;
  return UI_VARIANT_DEFAULT;
}

export function resolveUiVariant(request: NextRequest): UiVariant {
  const fromQuery = parseUiVariant(request.nextUrl.searchParams.get(UI_VARIANT_QUERY_PARAM));
  if (fromQuery) return fromQuery;
  const fromCookie = parseUiVariant(request.cookies.get(UI_VARIANT_COOKIE)?.value);
  if (fromCookie) return fromCookie;
  return UI_VARIANT_DEFAULT;
}

export function persistUiVariant(response: NextResponse, variant: UiVariant): void {
  response.cookies.set({
    name: UI_VARIANT_COOKIE,
    value: variant,
    maxAge: UI_VARIANT_COOKIE_MAX_AGE_SECONDS,
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}
