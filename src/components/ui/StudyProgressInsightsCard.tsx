import { Activity, Flame, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { StudyProgressInsights } from '../../lib/studyProgressInsights';
import type { WorkspaceAccent } from '../../lib/workspaceAccent';
import { formatMinutes, cx } from '../../lib/utils';
import { Card, ProgressBar } from './Primitives';

// Study Progress Insights — a small, reusable card shared by the APFC, UPSC CSE, and PhD Research
// dashboards (lib/studyProgressInsights.ts's own foundation, Phase 4 Step 2). Purely presentational:
// every number it shows is read straight off the `insights` prop a page already built via
// computeStudyProgressInsights(studyLog, ...) — this component computes nothing itself and reads no
// store, so workspace isolation is entirely the CALLER's responsibility (each dashboard already
// only ever passes its own workspace's studyLog into that calculation, the same way every other
// workspace-scoped number on these pages already works).
//
// `accent` (lib/workspaceAccent.ts) colours the streak figure and the completion progress bar —
// the two genuinely "identity" elements here — while the period-comparison delta uses the app's
// existing semantic emerald/rose (improved/declined), never the workspace accent, so a "good/bad"
// signal is never confused with which workspace is active (same separation the Workspace Visual
// Identity milestone already established for badges).

function DeltaIndicator({ delta, deltaPct }: { delta: number; deltaPct: number | null }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
        <Minus className="h-3 w-3" /> No change
      </span>
    );
  }
  const improved = delta > 0;
  return (
    <span className={cx('inline-flex items-center gap-1 text-xs font-medium', improved ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
      {improved ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {improved ? '+' : ''}
      {formatMinutes(Math.abs(delta))}
      {deltaPct !== null && (
        <>
          {' '}
          ({improved ? '+' : '-'}
          {Math.abs(deltaPct)}%)
        </>
      )}
    </span>
  );
}

export function StudyProgressInsightsCard({
  insights,
  accent,
  progressLabel = 'Completion',
  className,
}: {
  insights: StudyProgressInsights;
  accent: WorkspaceAccent;
  progressLabel?: string;
  /** Spacing is left to the caller (each dashboard already has its own convention — a
   * `space-y-*` wrapper vs. an explicit `mt-6` per card) rather than assumed here. */
  className?: string;
}) {
  return (
    <Card className={cx('p-5 sm:p-6', className)}>
      <div className="mb-4 flex items-center gap-2">
        <Activity className={cx('h-4 w-4', accent.text)} />
        <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Study Progress Insights</h3>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Last {insights.periodDays} days</p>
          <p className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white">{formatMinutes(insights.currentPeriod.focusMinutes)}</p>
          <p className="mt-0.5 text-xs text-slate-400">{insights.currentPeriod.activeDays} active day{insights.currentPeriod.activeDays === 1 ? '' : 's'}</p>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">vs previous {insights.periodDays} days</p>
          <div className="mt-1.5">
            <DeltaIndicator delta={insights.focusMinutesDelta} deltaPct={insights.focusMinutesDeltaPct} />
          </div>
          <p className="mt-1 text-xs text-slate-400">Previously {formatMinutes(insights.previousPeriod.focusMinutes)}</p>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Current streak</p>
          <p className={cx('mt-1 flex items-center gap-1.5 font-display text-xl font-bold', accent.text)}>
            <Flame className="h-4 w-4" /> {insights.streak.current}d
          </p>
          <p className="mt-0.5 text-xs text-slate-400">Best: {insights.streak.best}d</p>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Total activity</p>
          <p className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white">{formatMinutes(insights.totalActivity.focusMinutes)}</p>
          <p className="mt-0.5 text-xs text-slate-400">{insights.totalActivity.activeDays} active day{insights.totalActivity.activeDays === 1 ? '' : 's'} all-time</p>
        </div>
      </div>

      {insights.progressPercent !== null && (
        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium text-slate-600 dark:text-slate-300">{progressLabel}</span>
            <span className="text-slate-400">{insights.progressPercent}%</span>
          </div>
          <ProgressBar value={insights.progressPercent} colorClassName={accent.bar} height="h-1.5" />
        </div>
      )}
    </Card>
  );
}
