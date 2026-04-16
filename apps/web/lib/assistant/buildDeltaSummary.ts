import type { ReconciliationDelta } from "../reconciliation/reconcileEmailFacts";

export function buildDeltaSummary(delta: ReconciliationDelta): string {
  const totalChanges = delta.new.length + delta.updated.length + delta.completed.length + delta.invalidated.length;

  if (totalChanges === 0) {
    return "This email did not change any tasks.";
  }

  let summary = `This email changed ${totalChanges} things:\n\n`;

  if (delta.updated.length > 0) {
    summary += "UPDATED:\n";
    for (const { db, extracted } of delta.updated) {
      let changeStr = "";
      if (db.due_date !== extracted.dueDate) {
         changeStr += ` (${db.due_date || 'No Date'} → ${extracted.dueDate || 'No Date'})`;
      }
      summary += `- ${extracted.title}${changeStr}\n  Evidence: "${extracted.evidence}"\n`;
    }
    summary += "\n";
  }

  if (delta.completed.length > 0) {
    summary += "COMPLETED:\n";
    for (const { extracted } of delta.completed) {
      summary += `- ${extracted.title}\n  Evidence: "${extracted.evidence}"\n`;
    }
    summary += "\n";
  }

  if (delta.invalidated.length > 0) {
    summary += "INVALIDATED:\n";
    for (const db of delta.invalidated) {
      summary += `- ${db.title}\n`;
    }
    summary += "\n";
  }

  if (delta.new.length > 0) {
    summary += "NEW:\n";
    for (const item of delta.new) {
      summary += `- ${item.title}\n  Evidence: "${item.evidence}"\n`;
    }
    summary += "\n";
  }

  return summary.trim();
}
