import { describe, expect, it } from "vitest";
import { decryptJson, encryptJson } from "./crypto";

describe("integration crypto", () => {
  it("round-trips encrypted payloads", () => {
    const payload = { access_token: "abc", refresh_token: "def", expires_at: 12345 };
    const encrypted = encryptJson(payload);
    expect(encrypted).not.toContain("access_token");
    const decrypted = decryptJson<typeof payload>(encrypted);
    expect(decrypted).toEqual(payload);
  });
});
