import type { UnifiedDailyBriefing } from "@/lib/types";

type UnifiedDailyBriefingPanelProps = {
  briefing: UnifiedDailyBriefing | undefined;
};

export function UnifiedDailyBriefingPanel({ briefing }: UnifiedDailyBriefingPanelProps) {
  return (
    <div className="glass-panel min-w-0 rounded-2xl border border-white/10 p-4 sm:p-5" aria-label="Unified daily briefing">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="theme-accent text-[11px] font-semibold uppercase tracking-[0.16em]">Briefing</p>
      </div>
      {!briefing ? (
        <p className="theme-muted mt-3 text-sm leading-relaxed">You&apos;re all caught up.</p>
      ) : (
        <>
          <p className="theme-ink mt-3 text-sm leading-relaxed">{briefing.summary}</p>
          {briefing.aiSummary?.trim() ? (
            <p className="theme-muted mt-3 border-t border-white/10 pt-3 text-sm leading-relaxed">
              <span className="font-medium theme-ink">AI ·</span> {briefing.aiSummary.trim()}
            </p>
          ) : null}
          {briefing.urgent.length > 0 ? (
            <div className="mt-4">
              <p className="theme-accent text-[10px] uppercase tracking-[0.14em]">Focus</p>
              <ul className="mt-2 space-y-1.5 text-sm leading-snug theme-ink">
                {briefing.urgent.slice(0, 4).map((line) => (
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
