import { Dashboard } from "@/components/Dashboard";
import { getDashboardServerInitial } from "@/lib/serverDashboardInitial";
import { getSessionUserDisplayFirstName, getSessionUserId } from "@/lib/session";
import { redirect } from "next/navigation";

export async function RefactorHomePage() {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/sign-in?callbackUrl=%2F");
  }

  const greetingFirstName = await getSessionUserDisplayFirstName();
  const { initialData, initialError, initialSource } = await getDashboardServerInitial(userId);

  return (
    <div className="ui-variant-refactor-home">
      <div className="ui-variant-refactor-banner">
        Refactor preview is enabled. Switch back anytime from the UI toggle.
      </div>
      <Dashboard
        initialData={initialData}
        initialError={initialError}
        initialSource={initialSource}
        greetingFirstName={greetingFirstName}
      />
    </div>
  );
}

