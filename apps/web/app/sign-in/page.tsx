import { cookies } from "next/headers";
import { ClassicSignInPage } from "@/components/ui-variants/classic/SignInPage";
import { RefactorSignInPage } from "@/components/ui-variants/refactor/SignInPage";
import { UiVariantFrame } from "@/components/ui-variants/switchers/UiVariantFrame";
import { resolveUiVariantForServerPage } from "@/lib/uiVariant";

export const metadata = {
  title: "Sign in · MyAssist",
  description: "Sign in to MyAssist",
};

type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SignInPage({ searchParams }: { searchParams: PageSearchParams }) {
  const [sp, cookieStore] = await Promise.all([searchParams, cookies()]);
  const variant = await resolveUiVariantForServerPage({ searchParams: sp, cookieStore });

  return (
    <UiVariantFrame variant={variant}>
      {variant === "refactor" ? <RefactorSignInPage /> : <ClassicSignInPage />}
    </UiVariantFrame>
  );
}

