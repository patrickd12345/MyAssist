import { Dashboard } from "@/components/Dashboard";
import { getSessionUserDisplayFirstName, getSessionUserId } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const greetingFirstName = await getSessionUserDisplayFirstName();

  return (
    <Dashboard
      initialData={null}
      initialError={null}
      initialSource="live"
      greetingFirstName={greetingFirstName}
    />
  );
}
