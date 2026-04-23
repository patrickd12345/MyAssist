import Link from "next/link";
import { cookies } from "next/headers";
import { UiVariantFrame } from "@/components/ui-variants/switchers/UiVariantFrame";
import { resolveUiVariantForServerPage } from "@/lib/uiVariant";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ForgotPasswordPage({ searchParams }: { searchParams: PageSearchParams }) {
  const [sp, cookieStore] = await Promise.all([searchParams, cookies()]);
  const variant = await resolveUiVariantForServerPage({ searchParams: sp, cookieStore });

  return (
    <UiVariantFrame variant={variant}>
      <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-16">
        <div className={`glass-panel-strong rounded-[28px] px-6 py-8 sm:px-8 ${variant === "refactor" ? "ui-variant-refactor-auth" : ""}`}>
          <p className="theme-accent text-[11px] font-semibold uppercase tracking-[0.2em]">MyAssist</p>
          <h1 className="theme-ink mt-3 text-2xl font-semibold tracking-tight">Forgot password</h1>
          <p className="theme-muted mt-2 text-sm leading-relaxed">
            Enter the account email to receive password reset instructions.
          </p>
          <ForgotPasswordForm />
          <Link href="/sign-in" className="theme-muted mt-4 inline-block text-xs underline underline-offset-2">
            Back to sign in
          </Link>
        </div>
      </div>
    </UiVariantFrame>
  );
}
