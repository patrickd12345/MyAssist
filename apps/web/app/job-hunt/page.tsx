import { cookies } from "next/headers";
import { ClassicJobHuntPage } from "@/components/ui-variants/classic/JobHuntPage";
import { RefactorJobHuntPage } from "@/components/ui-variants/refactor/JobHuntPage";
import { UiVariantFrame } from "@/components/ui-variants/switchers/UiVariantFrame";
import { resolveUiVariantForServerPage } from "@/lib/uiVariant";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Job Hunt Cockpit · MyAssist",
  description: "Separate job hunt plugin UI (MCP job-hunt-manager)",
};

type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function JobHuntPage({ searchParams }: { searchParams: PageSearchParams }) {
  const [sp, cookieStore] = await Promise.all([searchParams, cookies()]);
  const variant = await resolveUiVariantForServerPage({ searchParams: sp, cookieStore });

  return (
    <UiVariantFrame variant={variant}>
      {variant === "refactor" ? <RefactorJobHuntPage /> : <ClassicJobHuntPage />}
    </UiVariantFrame>
  );
}

