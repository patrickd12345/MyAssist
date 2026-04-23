import Link from "next/link";

export default async function AuthCodeErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const sp = await searchParams;
  const reason = sp.reason;

  const detail =
    reason === "account_link"
      ? "An existing MyAssist profile already uses this email with a different account. Contact support or sign in with the original method."
      : "The link may have expired or already been used. Request a new magic link from the sign-in page.";

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center px-4 py-16">
      <div className="glass-panel-strong rounded-[28px] px-6 py-8 sm:px-8">
        <h1 className="theme-ink text-xl font-semibold tracking-tight">Could not complete sign-in</h1>
        <p className="theme-muted mt-3 text-sm leading-relaxed">{detail}</p>
        <Link
          href="/sign-in"
          className="theme-button-primary mt-6 inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold"
        >
          Back to sign-in
        </Link>
      </div>
    </div>
  );
}
