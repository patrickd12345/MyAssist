import Link from "next/link";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const trimmedCode = typeof code === "string" ? code.trim() : "";

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-16">
      <div className="glass-panel-strong rounded-[28px] px-6 py-8 sm:px-8">
        <p className="theme-accent text-[11px] font-semibold uppercase tracking-[0.2em]">MyAssist</p>
        <h1 className="theme-ink mt-3 text-2xl font-semibold tracking-tight">Reset password</h1>
        {trimmedCode ? (
          <ResetPasswordForm code={trimmedCode} />
        ) : (
          <p className="theme-muted mt-3 text-sm">Invalid reset link. Request a new one.</p>
        )}
        <Link href="/forgot-password" className="theme-muted mt-4 inline-block text-xs underline underline-offset-2">
          Request another reset link
        </Link>
      </div>
    </div>
  );
}
