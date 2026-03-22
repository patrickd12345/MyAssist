import { Dashboard } from "@/components/Dashboard";
import { fetchDailyContextFromN8n } from "@/lib/fetchDailyContext";
import type { MyAssistDailyContext } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  let initialData: MyAssistDailyContext | null = null;
  let initialError: string | null = null;
  try {
    initialData = await fetchDailyContextFromN8n();
  } catch (e) {
    initialError = e instanceof Error ? e.message : "Unknown error";
  }

  return <Dashboard initialData={initialData} initialError={initialError} />;
}
