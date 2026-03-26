import { Dashboard } from "@/components/Dashboard";
import { getSessionUserId } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <Dashboard initialData={null} initialError={null} initialSource="n8n" />
  );
}
