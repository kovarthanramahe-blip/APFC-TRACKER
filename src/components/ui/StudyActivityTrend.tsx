import { Sparkles } from 'lucide-react';
import type { DailyActivity } from '../../lib/studyProgressInsights';
import type { WorkspaceAccent } from '../../lib/workspaceAccent';
import { formatMinutes, cx } from '../../lib/utils';
import { Card } from './Primitives';

// Study Activity Trend — a compact, day-by-day bar view over the last N days of a SINGLE
// workspace's own studyLog entries (lib/studyProgressInsights.ts's buildDailyActivityTrend, the
// one place this day-by-day breakdown is computed — never re-derived here). Deliberately NOT the
// recharts-based chart pages/Analytics.tsx already has: that one is page-specific (14 days, fixed
// brand-blue fill, UTC-based date generation via its own private lastNDays — see this component's
// own inspection notes in the task report), not reusable across three differently-accented,
// compact dashboard cards. This is plain, dependency-free markup instead, matching the same
// lightweight aesthetic components/ui/StudyProgressInsightsCard.tsx already established.
//
// Every bar is rendered for every day in `days` — a day with zero activity is an explicit,
// visible empty bar (min height + no fill), never a day silently dropped from the row.

function dayLabel(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' });
}

function dayOfMonth(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').getDate().toString();
}

export function StudyActivityTrend({ days, accent, className }: { days: DailyActivity[]; accent: WorkspaceAccent; className?: string }) {
  const hasAnyActivity = days.some((d) => d.focusMinutes > 0 || d.isActive);
  const maxMinutes = Math.max(1, ...days.map((d) => d.focusMinutes));

  return (
    <Card className={cx('p-5 sm:p-6', className)}>
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className={cx('h-4 w-4', accent.text)} />
        <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Last {days.length} Days</h3>
      </div>

      {!hasAnyActivity ? (
        <p className="py-6 text-center text-sm text-slate-400">No study activity in the last {days.length} days yet.</p>
      ) : (
        <div className="flex items-end justify-between gap-1.5 sm:gap-2">
          {days.map((day) => {
            const heightPct = Math.round((day.focusMinutes / maxMinutes) * 100);
            return (
              <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] font-medium text-slate-400">{day.focusMinutes > 0 ? formatMinutes(day.focusMinutes) : ''}</span>
                <div className="flex h-20 w-full items-end overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800/70">
                  <div
                    className={cx('w-full rounded-md transition-all', day.focusMinutes > 0 ? accent.bar : '')}
                    style={{ height: `${day.focusMinutes > 0 ? Math.max(heightPct, 6) : 0}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{dayLabel(day.date)}</span>
                <span className="text-[9px] text-slate-400">{dayOfMonth(day.date)}</span>
                {(day.topicsCompleted > 0 || day.testsCompleted > 0) && <span className={cx('h-1 w-1 rounded-full', accent.bg)} aria-hidden="true" />}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
