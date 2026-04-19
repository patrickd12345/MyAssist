import { resolveMyAssistRuntimeEnv } from "./env/runtime";

type SendPasswordResetEmailInput = {
  to: string;
  resetUrl: string;
  env?: NodeJS.ProcessEnv;
};

type SendPasswordResetEmailResult =
  | { ok: true; sent: true }
  | { ok: true; sent: false; reason: "not_configured" }
  | { ok: false; sent: false; reason: "send_failed"; error: string };

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function sendPasswordResetEmail(
  input: SendPasswordResetEmailInput,
): Promise<SendPasswordResetEmailResult> {
  const runtime = resolveMyAssistRuntimeEnv(input.env ?? process.env);
  if (!runtime.resendApiKey || !runtime.passwordResetEmailFrom) {
    return { ok: true, sent: false, reason: "not_configured" };
  }

  const resetUrl = escapeHtml(input.resetUrl);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtime.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: runtime.passwordResetEmailFrom,
      to: input.to,
      subject: "Reset your MyAssist password",
      html: [
        "<p>Use this link to reset your MyAssist password:</p>",
        `<p><a href="${resetUrl}">Reset password</a></p>`,
        "<p>If you did not request this, you can ignore this email.</p>",
      ].join(""),
      text: `Use this link to reset your MyAssist password: ${input.resetUrl}`,
    }),
  });

  if (!res.ok) {
    return { ok: false, sent: false, reason: "send_failed", error: `Resend returned ${res.status}` };
  }

  return { ok: true, sent: true };
}
