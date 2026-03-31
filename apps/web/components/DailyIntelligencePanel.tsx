import type { DailyIntelligence } from "@/lib/types";

type DailyIntelligencePanelProps = {
  intel: DailyIntelligence | undefined;
};

export function DailyIntelligencePanel({ intel }: DailyIntelligencePanelProps) {
  return (
    <div
      className="glass-panel mt-4 rounded-[22px] border border-white/10 p-4"
      aria-label="Daily intelligence"
    >
      <p className="theme-accent text-[11px] uppercase tracking-[0.18em]">Daily intelligence</p>
      {!intel ? (
        <p className="theme-muted mt-2 text-sm leading-relaxed">
          No inbox triage snapshot on this load. Refresh the full daily context after Gmail is connected.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {(
              [
                ["Urgent", intel.urgent.length],
                ["Important", intel.important.length],
                ["Action", intel.action_required.length],
                ["Job", intel.job_related.length],
                ["Calendar", intel.calendar_related.length],
              ] as const
            ).map(([label, n]) => (
              <span
                key={label}
                className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold theme-ink"
              >
                {label}: {n}
              </span>
            ))}
          </div>
          <p className="theme-ink mt-3 text-sm leading-relaxed">{intel.summary.generatedDeterministicSummary}</p>
          {intel.summary.aiSummary?.trim() ? (
            <p className="theme-muted mt-2 border-t border-white/10 pt-2 text-sm leading-relaxed">
              <span className="font-semibold theme-ink">AI note:</span> {intel.summary.aiSummary.trim()}
            </p>
          ) : null}
          {intel.summary.topPriorities.length > 0 ? (
            <div className="mt-3">
              <p className="theme-accent text-[10px] uppercase tracking-[0.16em]">Top priorities</p>
              <ul className="mt-1 list-inside list-disc space-y-1 text-sm theme-ink">
                {intel.summary.topPriorities.slice(0, 5).map((line) => (
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
