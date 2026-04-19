import { afterEach, describe, expect, it, vi } from "vitest";
import { sendPasswordResetEmail } from "./passwordResetEmail";

describe("sendPasswordResetEmail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips sending when Resend is not configured", async () => {
    const result = await sendPasswordResetEmail({
      to: "user@example.com",
      resetUrl: "https://myassist.bookiji.com/reset-password?token=secret",
      env: {} as NodeJS.ProcessEnv,
    });

    expect(result).toEqual({ ok: true, sent: false, reason: "not_configured" });
  });

  it("sends the reset URL through Resend without returning the token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendPasswordResetEmail({
      to: "user@example.com",
      resetUrl: "https://myassist.bookiji.com/reset-password?token=secret-token",
      env: {
        RESEND_API_KEY: "re_test",
        MYASSIST_PASSWORD_RESET_EMAIL_FROM: "MyAssist <reset@example.com>",
      } as unknown as NodeJS.ProcessEnv,
    });

    expect(result).toEqual({ ok: true, sent: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_test",
          "Content-Type": "application/json",
        }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      from: "MyAssist <reset@example.com>",
      to: "user@example.com",
      subject: "Reset your MyAssist password",
    });
    expect(body.text).toContain("secret-token");
  });
});
