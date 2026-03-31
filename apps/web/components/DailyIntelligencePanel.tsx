import type { DailyIntelligence } from "@/lib/types";

type DailyIntelligencePanelProps = {
  intel: DailyIntelligence | undefined;
};

function bucketTotal(intel: NonNullable<DailyIntelligence>): number {
  return (
    intel.urgent.length +
    intel.important.length +
    intel.action_required.length +
    intel.job_related.length +
    intel.calendar_related.length
  );
}

export function DailyIntelligencePanel({ intel }: DailyIntelligencePanelProps) {
  const caughtUp =
    intel &&
    bucketTotal(intel) === 0 &&
    intel.summary.topPriorities.length === 0 &&
    !intel.summary.generatedDeterministicSummary.trim();

  return (
    <div
      className="glass-panel min-w-0 rounded-2xl border border-white/10 p-4 sm:p-5"
      aria-label="Daily intelligence"
    >
      <p className="theme-accent text-[11px] font-semibold uppercase tracking-[0.16em]">Inbox</p>
      {!intel ? (
        <p className="theme-muted mt-3 text-sm leading-relaxed">Connect Gmail to load triage.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-sm">
            {(
              [
                ["Urgent", intel.urgent.length],
                ["Important", intel.important.length],
                ["Action", intel.action_required.length],
                ["Job", intel.job_related.length],
                ["Calendar", intel.calendar_related.length],
              ] as const
            ).map(([label, n]) => (
              <span key={label} className="tabular-nums theme-ink">
                <span className="theme-muted font-normal">{label}</span>
                <span className="mx-1.5 text-white/25" aria-hidden>
                  ·
                </span>
                <span className="font-semibold">{n}</span>
              </span>
            ))}
          </div>
          {caughtUp ? (
            <p className="theme-muted mt-3 text-sm leading-relaxed">You&apos;re all caught up.</p>
          ) : (
            <p className="theme-ink mt-3 text-sm leading-relaxed">{intel.summary.generatedDeterministicSummary}</p>
          )}
          {intel.summary.aiSummary?.trim() ? (
            <p className="theme-muted mt-3 border-t border-white/10 pt-3 text-sm leading-relaxed">
              <span className="font-medium theme-ink">AI ·</span> {intel.summary.aiSummary.trim()}
            </p>
          ) : null}
          {intel.summary.topPriorities.length > 0 ? (
            <div className="mt-4">
              <p className="theme-accent text-[10px] uppercase tracking-[0.14em]">Priorities</p>
              <ul className="mt-2 space-y-1.5 text-sm leading-snug theme-ink">
                {intel.summary.topPriorities.slice(0, 5).map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/35" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
