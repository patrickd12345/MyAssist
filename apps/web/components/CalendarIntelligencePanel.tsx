import type { CalendarIntelligence } from "@/lib/types";

type CalendarIntelligencePanelProps = {
  intel: CalendarIntelligence | undefined;
};

export function CalendarIntelligencePanel({ intel }: CalendarIntelligencePanelProps) {
  return (
    <div
      className="glass-panel min-w-0 rounded-2xl border border-white/10 p-4 sm:p-5"
      aria-label="Calendar intelligence"
    >
      <p className="theme-accent text-[11px] font-semibold uppercase tracking-[0.16em]">Calendar</p>
      {!intel ? (
        <p className="theme-muted mt-3 text-sm leading-relaxed">Connect Calendar to load schedule.</p>
      ) : (
        <>
          <p className="theme-ink mt-3 text-sm leading-relaxed">{intel.summary}</p>
          <div className="theme-muted mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span>
              <span className="text-white/45">Events</span>
              <span className="mx-1 text-white/25" aria-hidden>
                ·
              </span>
              <span className="font-medium text-zinc-200">{intel.counts.eventsInWindow}</span>
            </span>
            <span>
              <span className="text-white/45">Timed</span>
              <span className="mx-1 text-white/25" aria-hidden>
                ·
              </span>
              <span className="font-medium text-zinc-200">{intel.counts.timedEventsInWindow}</span>
            </span>
            {intel.counts.minutesUntilNextMeeting !== null ? (
              <span>
                <span className="text-white/45">Next</span>
                <span className="mx-1 text-white/25" aria-hidden>
                  ·
                </span>
                <span className="font-medium text-zinc-200">~{intel.counts.minutesUntilNextMeeting} min</span>
              </span>
            ) : (
              <span className="text-white/40">No timed event next in window</span>
            )}
          </div>
          {intel.signals.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm leading-snug theme-ink">
              {intel.signals.slice(0, 8).map((s, idx) => (
                <li key={`${s.type}-${idx}`} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/35" aria-hidden />
                  <span>
                    <span className="font-medium">{s.type.replace(/_/g, " ")}</span>
                    {s.detail ? <span className="theme-muted"> — {s.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="theme-muted mt-3 text-sm leading-relaxed">You&apos;re all caught up.</p>
          )}
        </>
      )}
    </div>
  );
}
