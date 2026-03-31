import type { UnifiedDailyBriefing } from "@/lib/types";

type UnifiedDailyBriefingPanelProps = {
  briefing: UnifiedDailyBriefing | undefined;
};

export function UnifiedDailyBriefingPanel({ briefing }: UnifiedDailyBriefingPanelProps) {
  return (
    <div className="glass-panel mt-4 rounded-[22px] border border-white/10 p-4" aria-label="Unified daily briefing">
      <p className="theme-accent text-[11px] uppercase tracking-[0.18em]">Unified daily briefing</p>
      {!briefing ? (
        <p className="theme-muted mt-2 text-sm leading-relaxed">
          No unified daily briefing yet. Refresh daily context after Gmail, Calendar, and Todoist load.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold theme-ink">
              Urgent: {briefing.counts.urgent}
            </span>
            <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold theme-ink">
              Important: {briefing.counts.important}
            </span>
            <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold theme-ink">
              Action: {briefing.counts.action_required}
            </span>
            <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold theme-ink">
              Job: {briefing.counts.job_related}
            </span>
          </div>
          <p className="theme-ink mt-3 text-sm leading-relaxed">{briefing.summary}</p>
          {briefing.aiSummary?.trim() ? (
            <p className="theme-muted mt-2 border-t border-white/10 pt-2 text-sm leading-relaxed">
              <span className="font-semibold theme-ink">AI note:</span> {briefing.aiSummary.trim()}
            </p>
          ) : null}
          {briefing.urgent.length > 0 ? (
            <div className="mt-3">
              <p className="theme-accent text-[10px] uppercase tracking-[0.16em]">Top priorities</p>
              <ul className="mt-1 list-inside list-disc space-y-1 text-sm theme-ink">
                {briefing.urgent.slice(0, 4).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
