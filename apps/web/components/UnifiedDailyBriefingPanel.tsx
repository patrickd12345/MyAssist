import type { ReactNode } from "react";
import type { UnifiedDailyBriefing } from "@/lib/types";

type UnifiedDailyBriefingPanelProps = {
  briefing: UnifiedDailyBriefing | undefined;
};

function truncateLine(text: string, max = 160): { display: string; full: string } {
  const t = text.trim();
  if (t.length <= max) return { display: t, full: t };
  return { display: `${t.slice(0, max - 1).trim()}…`, full: t };
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-[5.5rem] flex-col rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center sm:min-w-0 sm:flex-1">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">{label}</span>
      <span className="mt-0.5 tabular-nums text-lg font-semibold leading-none text-zinc-50">{value}</span>
    </div>
  );
}

function BriefingBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-inner shadow-black/20">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{title}</h3>
      <div className="mt-2.5 text-[15px] leading-7 text-zinc-100">{children}</div>
    </div>
  );
}

export function UnifiedDailyBriefingPanel({ briefing }: UnifiedDailyBriefingPanelProps) {
  return (
    <div
      className="glass-panel min-w-0 rounded-2xl border border-white/10 p-4 sm:p-6"
      aria-label="Unified daily briefing"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="theme-accent text-[11px] font-semibold uppercase tracking-[0.16em]">Briefing</p>
      </div>
      {!briefing ? (
        <p className="theme-muted mt-4 text-base leading-relaxed">You&apos;re all caught up.</p>
      ) : (
        <div className="mt-4 space-y-5">
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <StatChip label="Urgent" value={briefing.counts.urgent} />
            <StatChip label="Important" value={briefing.counts.important} />
            <StatChip label="Action" value={briefing.counts.action_required} />
            <StatChip label="Job" value={briefing.counts.job_related} />
            <StatChip label="Meetings" value={briefing.calendar_events_in_view} />
          </div>

          <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-3">
            <BriefingBlock title="Schedule">
              <p className="break-words" title={truncateLine(briefing.schedule_summary, 500).full}>
                {truncateLine(briefing.schedule_summary).display}
              </p>
            </BriefingBlock>
            <BriefingBlock title="Tasks">
              <p className="break-words" title={truncateLine(briefing.tasks_summary, 500).full}>
                {truncateLine(briefing.tasks_summary).display}
              </p>
            </BriefingBlock>
            <BriefingBlock title="Email">
              <p className="break-words" title={truncateLine(briefing.email_summary, 500).full}>
                {truncateLine(briefing.email_summary).display}
              </p>
            </BriefingBlock>
          </div>

          {briefing.aiSummary?.trim() ? (
            <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.08] px-4 py-3 sm:px-5 sm:py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-200/90">AI summary</p>
              <p className="mt-2 text-[15px] leading-7 text-zinc-100">{briefing.aiSummary.trim()}</p>
            </div>
          ) : null}

          {briefing.urgent.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Focus now</p>
              <ul className="mt-3 space-y-3">
                {briefing.urgent.slice(0, 5).map((line) => {
                  const { display, full } = truncateLine(line, 140);
                  return (
                    <li
                      key={line}
                      className="flex gap-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.06] px-4 py-3 text-[15px] leading-6 text-zinc-50"
                    >
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400/90" aria-hidden />
                      <span className="min-w-0 flex-1" title={full !== display ? full : undefined}>
                        {display}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
