import { Dashboard } from "@/components/Dashboard";
import { getDashboardServerInitial } from "@/lib/serverDashboardInitial";
import { getSessionUserDisplayFirstName, getSessionUserId } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const greetingFirstName = await getSessionUserDisplayFirstName();
  const { initialData, initialError, initialSource } = await getDashboardServerInitial(userId);

  return (
    <Dashboard
      initialData={initialData}
      initialError={initialError}
      initialSource={initialSource}
      greetingFirstName={greetingFirstName}
    />
  );
}
