import { cookies } from "next/headers";
import { ClassicHomePage } from "@/components/ui-variants/classic/HomePage";
import { RefactorHomePage } from "@/components/ui-variants/refactor/HomePage";
import { UiVariantFrame } from "@/components/ui-variants/switchers/UiVariantFrame";
import { resolveUiVariantForServerPage } from "@/lib/uiVariant";

export const dynamic = "force-dynamic";

type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Home({ searchParams }: { searchParams: PageSearchParams }) {
  const [sp, cookieStore] = await Promise.all([searchParams, cookies()]);
  const variant = await resolveUiVariantForServerPage({ searchParams: sp, cookieStore });

  return (
    <UiVariantFrame variant={variant}>
      {variant === "refactor" ? <RefactorHomePage /> : <ClassicHomePage />}
    </UiVariantFrame>
  );
}

