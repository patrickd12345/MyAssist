import { describe, expect, it } from "vitest";
import {
  UI_VARIANT_DEFAULT,
  resolveUiVariantFromCookies,
  resolveUiVariantFromSearchParams,
  parseUiVariant,
} from "./uiVariant";

describe("uiVariant helpers", () => {
  it("parses valid variants", () => {
    expect(parseUiVariant("classic")).toBe("classic");
    expect(parseUiVariant("refactor")).toBe("refactor");
    expect(parseUiVariant(" REFACTOR ")).toBe("refactor");
  });

  it("returns null for invalid variants", () => {
    expect(parseUiVariant("beta")).toBeNull();
    expect(parseUiVariant("")).toBeNull();
    expect(parseUiVariant(undefined)).toBeNull();
  });

  it("resolves query variant when valid", () => {
    const params = new URLSearchParams("ui=refactor");
    expect(resolveUiVariantFromSearchParams(params)).toBe("refactor");
  });

  it("ignores invalid query variant", () => {
    const params = new URLSearchParams("ui=invalid");
    expect(resolveUiVariantFromSearchParams(params)).toBeNull();
  });

  it("resolves variant from record-style searchParams", () => {
    expect(resolveUiVariantFromSearchParams({ ui: "classic" })).toBe("classic");
    expect(resolveUiVariantFromSearchParams({ ui: ["refactor"] })).toBe("refactor");
  });

  it("resolves cookie variant when query missing", () => {
    const cookieStore = {
      get(name: string) {
        if (name === "myassist_ui_variant") return { value: "refactor" };
        return undefined;
      },
    };
    expect(resolveUiVariantFromCookies(cookieStore)).toBe("refactor");
  });

  it("falls back to default when variant absent", () => {
    expect(resolveUiVariantFromSearchParams(undefined) ?? UI_VARIANT_DEFAULT).toBe("classic");
  });
});

