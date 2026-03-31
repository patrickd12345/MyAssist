import type { CalendarIntelligence } from "@/lib/types";

type CalendarIntelligencePanelProps = {
  intel: CalendarIntelligence | undefined;
};

export function CalendarIntelligencePanel({ intel }: CalendarIntelligencePanelProps) {
  return (
    <div
      className="glass-panel mt-4 rounded-[22px] border border-white/10 p-4"
      aria-label="Calendar intelligence"
    >
      <p className="theme-accent text-[11px] uppercase tracking-[0.18em]">Calendar intelligence</p>
      {!intel ? (
        <p className="theme-muted mt-2 text-sm leading-relaxed">
          No calendar snapshot on this load. Connect Google Calendar and refresh the daily context.
        </p>
      ) : (
        <>
          <p className="theme-ink mt-2 text-sm leading-relaxed">{intel.summary}</p>
          <div className="theme-muted mt-2 flex flex-wrap gap-3 text-xs">
            <span>Events: {intel.counts.eventsInWindow}</span>
            <span>Timed: {intel.counts.timedEventsInWindow}</span>
            {intel.counts.minutesUntilNextMeeting !== null ? (
              <span>Next in ~{intel.counts.minutesUntilNextMeeting} min</span>
            ) : (
              <span>No upcoming timed event in window</span>
            )}
          </div>
          {intel.signals.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm theme-ink">
              {intel.signals.slice(0, 8).map((s, idx) => (
                <li key={`${s.type}-${idx}`}>
                  <span className="font-semibold">{s.type.replace(/_/g, " ")}</span>
                  {s.detail ? <span className="theme-muted"> — {s.detail}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="theme-muted mt-2 text-sm">No scheduling signals detected.</p>
          )}
        </>
      )}
    </div>
  );
}
