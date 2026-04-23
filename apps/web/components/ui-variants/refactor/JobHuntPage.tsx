import { Suspense } from "react";
import { JobHuntCockpit } from "@/components/JobHuntCockpit";
import { getSessionUserId } from "@/lib/session";
import { redirect } from "next/navigation";

export async function RefactorJobHuntPage() {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/sign-in?callbackUrl=/job-hunt");
  }

  return (
    <div className="ui-variant-refactor-page">
      <Suspense
        fallback={
          <div className="theme-shell mx-auto min-h-screen max-w-[1900px] px-4 py-12 text-sm text-zinc-400">
            Loading job hunt…
          </div>
        }
      >
        <JobHuntCockpit />
      </Suspense>
    </div>
  );
}

