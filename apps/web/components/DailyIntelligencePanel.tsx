import type { DailyIntelligence } from "@/lib/types";

type DailyIntelligencePanelProps = {
  intel: DailyIntelligence | undefined;
};

function bucketTotal(intel: NonNullable<DailyIntelligence>): number {
  return (
    intel.urgent.length +
    intel.important.length +
    intel.action_required.length +
    intel.job_related.length
  );
}

function BucketBadge({ label, n }: { label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-sm tabular-nums text-zinc-100">
      <span className="font-medium text-zinc-400">{label}</span>
      <span className="text-white/35" aria-hidden>
        ·
      </span>
      <span className="font-semibold">{n}</span>
    </span>
  );
}

/** When we already show bucket badges + a priorities list, the deterministic summary repeats the same counts and subjects. */
function shouldHideVerboseSummary(intel: NonNullable<DailyIntelligence>): boolean {
  return intel.summary.topPriorities.length > 0;
}

export function DailyIntelligencePanel({ intel }: DailyIntelligencePanelProps) {
  const caughtUp =
    intel &&
    bucketTotal(intel) === 0 &&
    intel.summary.topPriorities.length === 0 &&
    !intel.summary.generatedDeterministicSummary.trim();

  return (
    <div
      className="glass-panel min-w-0 rounded-2xl border border-white/10 p-4 sm:p-6"
      aria-label="Daily intelligence"
    >
      <p className="theme-accent text-[11px] font-semibold uppercase tracking-[0.16em]">Inbox</p>
      {!intel ? (
        <p className="theme-muted mt-4 text-base leading-relaxed">Connect Gmail to load triage.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <BucketBadge label="Urgent" n={intel.urgent.length} />
            <BucketBadge label="Important" n={intel.important.length} />
            <BucketBadge label="Action" n={intel.action_required.length} />
            <BucketBadge label="Job" n={intel.job_related.length} />
            <BucketBadge label="Calendar" n={intel.calendar_related.length} />
          </div>
          {caughtUp ? (
            <p className="theme-muted mt-4 text-base leading-relaxed">You&apos;re all caught up.</p>
          ) : (
            <>
              {!shouldHideVerboseSummary(intel) ? (
                <p className="mt-4 whitespace-pre-line text-[15px] leading-7 text-zinc-100">
                  {intel.summary.generatedDeterministicSummary}
                </p>
              ) : null}
              {intel.summary.aiSummary?.trim() ? (
                <div className="mt-4 rounded-2xl border border-violet-500/20 bg-violet-500/[0.08] px-4 py-3 sm:px-5 sm:py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-200/90">AI · Inbox</p>
                  <p className="mt-2 text-[15px] leading-7 text-zinc-100">{intel.summary.aiSummary.trim()}</p>
                </div>
              ) : null}
              {intel.summary.topPriorities.length > 0 ? (
                <div className="mt-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Top subjects</p>
                  <ul className="mt-3 space-y-2.5">
                    {intel.summary.topPriorities.slice(0, 6).map((line) => {
                      const short = line.length > 120 ? `${line.slice(0, 117)}…` : line;
                      return (
                        <li
                          key={line}
                          className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-2.5 text-[15px] leading-6 text-zinc-100"
                        >
                          <span className="line-clamp-3" title={line}>
                            {short}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
