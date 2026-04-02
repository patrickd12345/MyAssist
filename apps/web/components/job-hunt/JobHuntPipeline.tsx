"use client";

import { useMemo } from "react";
import type { LifecycleStage } from "job-hunt-manager/types/lifecycle";
import type { SavedJobRow } from "@/lib/jobHuntUiTypes";
import { PIPELINE_COLUMNS, columnForStage } from "@/lib/jobHuntUiTypes";

type Props = {
  savedJobs: SavedJobRow[];
  savedLoading: boolean;
  savedError: string | null;
  onOpenJob: (row: SavedJobRow) => void;
};

export function JobHuntPipeline({ savedJobs, savedLoading, savedError, onOpenJob }: Props) {
  const byColumn = useMemo(() => {
    const map = new Map<string, SavedJobRow[]>();
    for (const col of PIPELINE_COLUMNS) {
      map.set(col.id, []);
    }
    for (const row of savedJobs) {
      const colId = columnForStage(row.lifecycle.stage as LifecycleStage);
      const list = map.get(colId);
      if (list) list.push(row);
      else {
        const lead = map.get("lead");
        if (lead) lead.push(row);
      }
    }
    return map;
  }, [savedJobs]);

  return (
    <div className="space-y-4" role="tabpanel" id="panel-pipeline" aria-labelledby="tab-pipeline">
      <p className="theme-muted text-xs leading-5">
        Kanban by lifecycle stage. Click a card for details, timeline notes, and contact assignment.
      </p>
      {savedError ? (
        <p className="text-sm text-rose-300" role="alert">
          {savedError}
        </p>
      ) : null}
      {savedLoading ? (
        <p className="theme-muted text-sm">Loading saved jobs…</p>
      ) : savedJobs.length === 0 ? (
        <p className="theme-muted text-sm">
          No saved jobs yet. Use the Discovery tab to save from the feed or Add by job id.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {PIPELINE_COLUMNS.map((col) => {
            const rows = byColumn.get(col.id) ?? [];
            return (
              <div
                key={col.id}
                className="flex min-w-[220px] max-w-[280px] flex-1 flex-col rounded-[24px] border border-white/10 bg-black/20"
              >
                <div className="border-b border-white/10 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-300">{col.label}</p>
                  <p className="text-[10px] text-zinc-500">{rows.length} job{rows.length === 1 ? "" : "s"}</p>
                </div>
                <ul className="flex max-h-[min(70vh,720px)] flex-col gap-2 overflow-y-auto p-2">
                  {rows.map((row) => {
                    const j = row.job;
                    const title = j?.title ?? row.saved.job_id;
                    const company = j?.company ?? "—";
                    return (
                      <li key={row.saved.job_id}>
                        <button
                          type="button"
                          onClick={() => onOpenJob(row)}
                          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-left text-sm transition hover:bg-white/[0.08]"
                        >
                          <span className="font-semibold text-zinc-100 line-clamp-2">{title}</span>
                          <span className="theme-muted mt-1 block text-xs">{company}</span>
                          <span className="mt-1 block text-[10px] text-zinc-500">
                            {row.lifecycle.stage.replace(/_/g, " ")} · {row.saved.track}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
