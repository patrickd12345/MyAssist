import crypto from "crypto";
import type { ExtractedObligation } from "../ai/extractEmailFacts";

export type DbObligation = {
  id: string;
  thread_id: string;
  source_message_id: string;
  obligation_hash: string;
  title: string;
  due_date: string | null;
  status: "open" | "done" | "invalid";
  evidence: string;
  todoist_task_id: string | null;
};

export type ReconciliationDelta = {
  new: ExtractedObligation[];
  updated: Array<{ db: DbObligation; extracted: ExtractedObligation }>;
  completed: Array<{ db: DbObligation; extracted: ExtractedObligation }>;
  invalidated: DbObligation[];
  unchanged: DbObligation[];
};

function hashString(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function computeObligationHash(title: string): string {
  // Normalize string for stable hashing
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return hashString(normalized);
}

export function reconcileEmailFacts(
  threadId: string,
  sourceMessageId: string,
  extracted: ExtractedObligation[],
  existing: DbObligation[]
): ReconciliationDelta {
  const delta: ReconciliationDelta = {
    new: [],
    updated: [],
    completed: [],
    invalidated: [],
    unchanged: [],
  };

  const existingMap = new Map(existing.map((db) => [db.obligation_hash, db]));
  const extractedHashes = new Set<string>();

  for (const ext of extracted) {
    const hash = computeObligationHash(ext.title);
    extractedHashes.add(hash);
    const db = existingMap.get(hash);

    if (!db) {
      delta.new.push({ ...ext, id: hash }); // Replace ID with hash for consistency later if needed
    } else {
      const isStatusChangedToDone = db.status === "open" && ext.status === "done";
      const isTitleChanged = db.title !== ext.title;
      const isDueDateChanged =
        (db.due_date || "") !== (ext.dueDate || "");

      if (isStatusChangedToDone) {
        delta.completed.push({ db, extracted: ext });
      } else if (isTitleChanged || isDueDateChanged) {
        delta.updated.push({ db, extracted: ext });
      } else {
        delta.unchanged.push(db);
      }
    }
  }

  // Find invalidated (existing open tasks not present in the new extraction)
  for (const db of existing) {
    if (db.status === "open" && !extractedHashes.has(db.obligation_hash)) {
      delta.invalidated.push(db);
    }
  }

  return delta;
}
