import { getSupabaseAdmin as supabaseAdmin } from "../supabaseAdmin";
import type { ReconciliationDelta } from "./reconcileEmailFacts";
import { computeObligationHash } from "./reconcileEmailFacts";

// Note: To satisfy "No breaking changes" and keeping things contained,
// we should only upsert facts to the new table. We'll assume supabaseAdmin
// has the necessary keys. We're using a direct upsert matching the requested behavior.

export async function persistEmailObligations(
  threadId: string,
  sourceMessageId: string,
  delta: ReconciliationDelta
): Promise<void> {
  const now = new Date().toISOString();
  const upsertPayloads = [];

  // 1. New items
  for (const ext of delta.new) {
    const hash = computeObligationHash(ext.title);
    upsertPayloads.push({
      thread_id: threadId,
      source_message_id: sourceMessageId,
      obligation_hash: hash,
      title: ext.title,
      due_date: ext.dueDate || null,
      status: ext.status || "open",
      evidence: ext.evidence,
      last_seen_at: now,
      updated_at: now,
    });
  }

  // 2. Updated items
  for (const { db, extracted } of delta.updated) {
    upsertPayloads.push({
      ...db,
      title: extracted.title,
      due_date: extracted.dueDate || null,
      status: extracted.status || db.status,
      evidence: extracted.evidence,
      last_seen_at: now,
      updated_at: now,
    });
  }

  // 3. Completed items
  for (const { db, extracted } of delta.completed) {
    upsertPayloads.push({
      ...db,
      status: "done",
      evidence: extracted.evidence,
      last_seen_at: now,
      updated_at: now,
    });
  }

  // 4. Invalidated items
  for (const db of delta.invalidated) {
    upsertPayloads.push({
      ...db,
      status: "invalid",
      last_seen_at: now,
      updated_at: now,
    });
  }

  // 5. Unchanged items (just update last_seen_at)
  for (const db of delta.unchanged) {
    upsertPayloads.push({
      ...db,
      last_seen_at: now,
    });
  }

  if (upsertPayloads.length === 0) return;

  const adminClient = supabaseAdmin();
  if (!adminClient) throw new Error("Supabase admin not available");
  const { error } = await adminClient
    .from("email_obligations")
    .upsert(upsertPayloads, { onConflict: "thread_id,obligation_hash" });

  if (error) {
    console.error("Failed to persist email obligations:", error);
    throw new Error("Persist email obligations failed");
  }
}
