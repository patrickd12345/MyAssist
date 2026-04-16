import { getSupabaseAdmin as supabaseAdmin } from "../supabaseAdmin";
import { extractEmailFacts } from "../ai/extractEmailFacts";
import { reconcileEmailFacts } from "./reconcileEmailFacts";
import { persistEmailObligations } from "./persistEmailObligations";
import { syncTodoist } from "./syncTodoist";
import { buildDeltaSummary } from "../assistant/buildDeltaSummary";
import type { DbObligation } from "./reconcileEmailFacts";

export async function processEmailObligations(
  userId: string,
  threadId: string,
  messageId: string,
  subject: string,
  body: string,
  gatewayCall: (prompt: string, schema: unknown) => Promise<unknown>,
  userApprovedWrites: boolean = false
) {
  // 1. Extract facts
  const extracted = await extractEmailFacts(subject, body, gatewayCall);

  // 2. Fetch existing from DB
  const adminClient = supabaseAdmin();
  if (!adminClient) throw new Error("Supabase admin not available");
  const { data, error } = await adminClient
    .from("email_obligations")
    .select("*")
    .eq("thread_id", threadId);

  if (error) {
    console.error("Failed to fetch existing obligations:", error);
    throw new Error("DB fetch failed");
  }

  const existing = (data || []) as DbObligation[];

  // 3. Reconcile
  const delta = reconcileEmailFacts(threadId, messageId, extracted, existing);

  // 4. Persist
  await persistEmailObligations(threadId, messageId, delta);

  // 5. Sync to Todoist if approved
  if (userApprovedWrites) {
    await syncTodoist(userId, threadId, delta);
  }

  // 6. Return Delta Summary
  return buildDeltaSummary(delta);
}
