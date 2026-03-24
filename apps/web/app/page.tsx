import { Dashboard } from "@/components/Dashboard";
import { fetchDailyContextFromN8n, type DailyContextSource } from "@/lib/fetchDailyContext";
import type { MyAssistDailyContext } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  let initialData: MyAssistDailyContext | null = null;
  let initialSource: DailyContextSource = "n8n";
  let initialError: string | null = null;
  try {
    const { context, source } = await fetchDailyContextFromN8n();
    initialData = context;
    initialSource = source;
  } catch (e) {
    initialError = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <Dashboard
      initialData={initialData}
      initialError={initialError}
      initialSource={initialSource}
    />
  );
}
