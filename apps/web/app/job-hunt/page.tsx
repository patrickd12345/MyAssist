import { Suspense } from "react";
import { JobHuntCockpit } from "@/components/JobHuntCockpit";
import { getSessionUserId } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Job Hunt Cockpit · MyAssist",
  description: "Separate job hunt plugin UI (MCP job-hunt-manager)",
};

export default async function JobHuntPage() {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/sign-in?callbackUrl=/job-hunt");
  }

  return (
    <Suspense
      fallback={
        <div className="theme-shell mx-auto min-h-screen max-w-[1900px] px-4 py-12 text-sm text-zinc-400">
          Loading job hunt…
        </div>
      }
    >
      <JobHuntCockpit />
    </Suspense>
  );
}
