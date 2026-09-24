import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Compass, TrendingUp, TrendingDown, Minus, Repeat, Gauge, BarChart3, BookOpen, Brain, ListChecks, Clock, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { getWorkspaceMeta } from '../lib/workspace';
import { getLocalDateString, cx } from '../lib/utils';
import { Card, Badge, PageHeader, ProgressBar, WorkspaceComingSoon } from '../components/ui/Primitives';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';
import { UPSC_CSE_MAINS_SYLLABUS } from '../data/upscCseMainsSyllabus';
import { UPSC_CSE_GRANULAR_NODES } from '../data/upscCseGranularTopics';
import { UPSC_CSE_PRELIMS_PYQ_BANK } from '../data/pyqUpscCsePrelims';
import { computeUpscCseAnalytics } from '../lib/upscCseAnalytics';
import { UNMAPPED_MICROSYLLABUS } from '../lib/upscCsePrelimsPyqFilters';
import type { UpscCsePrelimsPerformanceTrend } from '../lib/upscCsePrelimsPyqPerformance';
import { getWorkspaceAccent } from '../lib/workspaceAccent';
import { buildDailyActivityTrend } from '../lib/studyProgressInsights';
import { StudyActivityTrend } from '../components/ui/StudyActivityTrend';

function StatTile({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'success' | 'danger' | 'brand' }) {
  const tones: Record<string, string> = {
    neutral: 'text-slate-800 dark:text-slate-100',
    success: 'text-emerald-600 dark:text-emerald-400',
    danger: 'text-rose-600 dark:text-rose-400',
    brand: 'text-brand-600 dark:text-brand-400',
  };
  return (
    <Card className="p-4 text-center">
      <p className={cx('font-display text-xl font-bold', tones[tone])}>{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{label}</p>
    </Card>
  );
}

function progressToneClass(pct: number): string {
  if (pct >= 90) return 'bg-emerald-500';
  if (pct >= 34) return 'bg-amber-500';
  return 'bg-slate-400 dark:bg-slate-600';
}

// PYQ Weak Spots — Recent Performance (Phase 6 Step 2). A deterministic recent-vs-previous accuracy
// comparison (lib/upscCsePrelimsPyqPerformance.ts's computeUpscCsePrelimsRecentVsPreviousTrend) —
// never a subjective score, and explicit about not having enough data yet rather than guessing.
function PyqTrendBadge({ trend }: { trend: UpscCsePrelimsPerformanceTrend }) {
  if (trend.direction === 'insufficient_data') {
    return <p className="text-xs text-slate-400">Not enough recent tests yet to judge a trend.</p>;
  }
  const meta: Record<Exclude<UpscCsePrelimsPerformanceTrend['direction'], 'insufficient_data'>, { label: string; tone: 'success' | 'danger' | 'neutral'; icon: typeof TrendingUp }> = {
    improving: { label: 'Improving', tone: 'success', icon: TrendingUp },
    declining: { label: 'Declining', tone: 'danger', icon: TrendingDown },
    stable: { label: 'Stable', tone: 'neutral', icon: Minus },
  };
  const m = meta[trend.direction];
  const Icon = m.icon;
  return (
    <div>
      <Badge tone={m.tone}>
        <Icon className="h-3 w-3" /> {m.label}
      </Badge>
      <p className="mt-1.5 text-[11px] text-slate-400">
        Last {trend.recentAttemptCount} tests: {trend.recentAccuracy?.toFixed(0)}% vs previous {trend.previousAttemptCount}: {trend.previousAccuracy?.toFixed(0)}%
      </p>
    </div>
  );
}

export default function UpscCseAnalytics() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const coverage = useAppStore((s) => s.upscCseSyllabusCoverage);
  const attempts = useAppStore((s) => s.upscCsePrelimsPyqAttempts);
  const bookmarkedPyqIds = useAppStore((s) => s.bookmarkedPyqIds);
  const revisionQueue = useAppStore((s) => s.revisionQueue);
  const studyTasks = useAppStore((s) => s.upscCseStudyTasks);
  const studyLog = useAppStore((s) => s.studyLog);

  const today = useMemo(() => getLocalDateString(), []);
  const workspaceAccent = getWorkspaceAccent(activeWorkspaceId);
  // Study Activity Trend (Phase 4 Step 5) — reuses buildDailyActivityTrend (lib/studyProgressInsights.ts),
  // the same canonical calculation the dashboards already use; no second calculation.
  const activityTrend = useMemo(() => buildDailyActivityTrend(studyLog, today, 7), [studyLog, today]);

  const analytics = useMemo(
    () =>
      computeUpscCseAnalytics({
        coverage,
        prelimsTree: UPSC_CSE_PRELIMS_SYLLABUS,
        mainsTree: UPSC_CSE_MAINS_SYLLABUS,
        granularNodes: UPSC_CSE_GRANULAR_NODES,
        pyqBank: UPSC_CSE_PRELIMS_PYQ_BANK,
        attempts,
        bookmarkedPyqIds,
        revisionQueue,
        studyTasks,
        today,
      }),
    [coverage, attempts, bookmarkedPyqIds, revisionQueue, studyTasks, today],
  );

  if (activeWorkspaceId !== 'upsc_cse') {
    return (
      <div>
        <PageHeader eyebrow="UPSC CSE" title="Analytics" />
        <WorkspaceComingSoon icon={Compass} workspaceLabel={getWorkspaceMeta(activeWorkspaceId).shortLabel} />
      </div>
    );
  }

  const { performance, weakSpots } = analytics;
  const weakAreas = performance ? performance.weakMicrosyllabus.filter((m) => m.microsyllabusId !== UNMAPPED_MICROSYLLABUS && m.attempted >= 2) : [];
  const strongAreas = performance ? performance.strongestMicrosyllabus.filter((m) => m.microsyllabusId !== UNMAPPED_MICROSYLLABUS && m.attempted >= 2) : [];

  return (
    <div>
      <PageHeader eyebrow="UPSC CSE" title="Analytics" description="Real syllabus coverage, PYQ performance, and study-plan progress — nothing here is estimated or fabricated." />

      {/* Overall */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
        <StatTile label="Overall Coverage" value={`${analytics.overallCoverage.weightedPct}%`} tone="brand" />
        <StatTile label="Questions Attempted" value={`${performance?.overall.totalAttempted ?? 0}/${analytics.totalQuestions}`} />
        <StatTile label="Accuracy" value={performance ? `${performance.overall.overallAccuracy.toFixed(1)}%` : '—'} tone="success" />
        <StatTile label="Unanswered" value={`${analytics.unattemptedCount}`} tone={analytics.unattemptedCount > 0 ? 'danger' : 'neutral'} />
      </div>

      {/* Syllabus */}
      <Card className="mb-6 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Syllabus Coverage</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mb-4">
          <div className="rounded-xl border border-slate-200/70 dark:border-slate-800 p-3">
            <p className="text-xs text-slate-400">Prelims</p>
            <p className="font-display text-lg font-bold text-slate-800 dark:text-slate-100">{analytics.prelimsCoverage.weightedPct}%</p>
            <ProgressBar value={analytics.prelimsCoverage.weightedPct} height="h-1.5" />
          </div>
          <div className="rounded-xl border border-slate-200/70 dark:border-slate-800 p-3">
            <p className="text-xs text-slate-400">Mains</p>
            <p className="font-display text-lg font-bold text-slate-800 dark:text-slate-100">{analytics.mainsCoverage.weightedPct}%</p>
            <ProgressBar value={analytics.mainsCoverage.weightedPct} height="h-1.5" />
          </div>
        </div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">By Subject</p>
        <ul className="space-y-1.5">
          {analytics.subjectCoverage.map((s) => (
            <li key={s.subjectId}>
              <Link to="/upsc-syllabus" className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <span className={cx('flex h-6 w-10 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white', progressToneClass(s.summary.weightedPct))}>{s.summary.weightedPct}%</span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-600 dark:text-slate-300">{s.title}</span>
                <Badge tone="neutral">{s.stage === 'prelims' ? 'Prelims' : 'Mains'}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <StudyActivityTrend days={activityTrend} accent={workspaceAccent} className="mb-6" />

      {/* PYQ performance */}
      <Card className="mb-6 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">PYQ Performance</h3>
        </div>
        {!performance ? (
          <p className="py-4 text-center text-sm text-slate-400">No PYQ attempts recorded yet.</p>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <StatTile label="Correct" value={`${performance.overall.totalCorrect}`} tone="success" />
              <StatTile label="Wrong" value={`${performance.overall.totalWrong}`} tone="danger" />
              <StatTile label="Tests Taken" value={`${performance.overall.testsCompleted}`} />
            </div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">By Year / Paper</p>
            <ul className="mb-4 space-y-1">
              {performance.yearPaper.map((yp) => (
                <li key={`${yp.year}-${yp.paper}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-slate-600 dark:text-slate-300">
                  <span>
                    {yp.year} · {yp.paper}
                  </span>
                  <span className="text-xs text-slate-400">
                    {yp.correct}/{yp.attempted} ({yp.accuracy.toFixed(0)}%)
                  </span>
                </li>
              ))}
            </ul>

            {weakAreas.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rose-500">
                  <TrendingDown className="h-3.5 w-3.5" /> Weakest Areas
                </p>
                <ul className="space-y-1">
                  {weakAreas.map((m) => (
                    <li key={m.microsyllabusId}>
                      <Link to={`/upsc-pyq-test?microsyllabusId=${encodeURIComponent(m.microsyllabusId)}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-sm">
                        <span className="text-slate-600 dark:text-slate-300">{m.title}</span>
                        <span className="text-xs text-rose-500">
                          {m.correct}/{m.attempted} ({m.accuracy.toFixed(0)}%)
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {strongAreas.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  <TrendingUp className="h-3.5 w-3.5" /> Strongest Areas
                </p>
                <ul className="space-y-1">
                  {strongAreas.map((m) => (
                    <li key={m.microsyllabusId} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-slate-600 dark:text-slate-300">
                      <span>{m.title}</span>
                      <span className="text-xs text-emerald-500">
                        {m.correct}/{m.attempted} ({m.accuracy.toFixed(0)}%)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(weakSpots.repeatedMistakeMicrosyllabus.length > 0 || weakSpots.repeatedMistakeSubjects.length > 0 || weakSpots.trend.direction !== 'insufficient_data') && (
              <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">PYQ Weak Spots</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      <Repeat className="h-3.5 w-3.5 text-rose-500" /> Repeated Mistakes
                    </div>
                    {weakSpots.repeatedMistakeMicrosyllabus.length === 0 ? (
                      <p className="text-xs text-slate-400">No repeated mistakes yet.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {weakSpots.repeatedMistakeMicrosyllabus.slice(0, 4).map((m) => (
                          <li key={m.microsyllabusId} className="flex items-center justify-between gap-2 text-xs">
                            <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">{m.title}</span>
                            <Badge tone="danger">
                              {m.wrong} mistake{m.wrong === 1 ? '' : 's'}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      <ListChecks className="h-3.5 w-3.5 text-brand-500" /> Revise Next
                    </div>
                    {weakSpots.repeatedMistakeSubjects.length === 0 ? (
                      <p className="text-xs text-slate-400">Nothing flagged yet.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {weakSpots.repeatedMistakeSubjects.slice(0, 3).map((s) => (
                          <li key={s.subject} className="flex items-center justify-between gap-2 text-xs">
                            <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">{s.subject}</span>
                            <Badge tone="warning">
                              {s.wrong} mistake{s.wrong === 1 ? '' : 's'}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      <Gauge className="h-3.5 w-3.5 text-brand-500" /> Recent Performance
                    </div>
                    <PyqTrendBadge trend={weakSpots.trend} />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Revision */}
      <Card className="mb-6 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Brain className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Revision</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Tracked" value={`${analytics.revision.totalTracked}`} />
          <StatTile label="Due Today" value={`${analytics.revision.dueCount}`} tone={analytics.revision.dueCount > 0 ? 'danger' : 'neutral'} />
          <StatTile label="New" value={`${analytics.revision.newCount}`} />
          <StatTile label="Mastered" value={`${analytics.revision.masteredCount}`} tone="success" />
        </div>
        <Link to="/upsc-pyq-test?view=revision" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
          Review Revision Questions
        </Link>
      </Card>

      {/* Study plan */}
      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Study Plan</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Pending" value={`${analytics.studyTasks.counts.pending}`} />
          <StatTile label="In Progress" value={`${analytics.studyTasks.counts.in_progress}`} tone="brand" />
          <StatTile label="Overdue" value={`${analytics.studyTasks.overdueCount}`} tone={analytics.studyTasks.overdueCount > 0 ? 'danger' : 'neutral'} />
          <StatTile label="Completion Rate" value={`${analytics.studyTasks.completionRatePct}%`} tone="success" />
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {analytics.studyTasks.totalPlannedMinutes} min planned total
          </span>
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> {analytics.studyTasks.plannedMinutesCompleted} min planned for completed tasks
          </span>
        </div>
        <Link to="/upsc-study-plan" className="mt-3 inline-block text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
          Open Study Plan
        </Link>
      </Card>
    </div>
  );
}
