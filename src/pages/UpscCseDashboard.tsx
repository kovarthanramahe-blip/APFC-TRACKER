import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, ListTodo, Plus, Trash2, Clock, Flame, TrendingDown, History as HistoryIcon, BookOpen, ListChecks, Brain, XCircle } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { getWorkspaceMeta } from '../lib/workspace';
import { getLocalDateString, cx, uuid } from '../lib/utils';
import { Card, Button, Badge, PageHeader, ProgressBar, WorkspaceComingSoon } from '../components/ui/Primitives';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';
import { UPSC_CSE_MAINS_SYLLABUS } from '../data/upscCseMainsSyllabus';
import { UPSC_CSE_PRELIMS_PYQ_BANK } from '../data/pyqUpscCsePrelims';
import { UPSC_CSE_GRANULAR_NODES } from '../data/upscCseGranularTopics';
import { computeUpscCseDashboardSnapshot } from '../lib/upscCseDashboard';
import { generateTodaysStudyItems, type UpscCseTodaysStudyItemKind } from '../lib/upscCseTodaysStudy';
import { createUpscCseStudyTask, isValidStudyTaskTitle, tasksForDate, countStudyTasksByStatus } from '../lib/upscCseStudyTask';
import { examTargetsForWorkspace } from '../lib/examTarget';
import { ExamTargetCard } from '../components/ui/ExamTargetCard';
import { computeStudyProgressInsights, buildDailyActivityTrend } from '../lib/studyProgressInsights';
import { getEncouragementMessage } from '../lib/gamification';
import { getWorkspaceAccent } from '../lib/workspaceAccent';
import { StudyProgressInsightsCard } from '../components/ui/StudyProgressInsightsCard';
import { StudyActivityTrend } from '../components/ui/StudyActivityTrend';

// UPSC CSE Study Dashboard — connects the syllabus (lib/upscCseSyllabusCoverage.ts), PYQ practice
// (data/pyqUpscCsePrelims.ts, lib/upscCsePrelimsPyqPerformance.ts), revision queue
// (lib/revisionQueue.ts, reused as-is for UPSC ids), and this stage's new lightweight study-task
// list into ONE daily workflow. Every number and every "Today's Study" item is computed live from
// already-persisted store state (lib/upscCseDashboard.ts / lib/upscCseTodaysStudy.ts) — nothing on
// this page is a second syllabus, practice engine, revision system, or analytics engine; it only
// reads through the existing ones and links out to the existing pages that already handle each
// action (pages/UpscCseSyllabus.tsx, pages/UpscCsePyqTest.tsx).

const KIND_ICON: Record<UpscCseTodaysStudyItemKind, typeof BookOpen> = {
  syllabus: BookOpen,
  revision: Brain,
  incorrect: XCircle,
  unanswered: ListChecks,
  weak_area: TrendingDown,
};

function CoverageStatTile({ label, summary }: { label: string; summary: { weightedPct: number; total: number; counts: { strong: number } } }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">{summary.weightedPct}%</p>
      <p className="mt-0.5 text-xs text-slate-400">
        {summary.counts.strong}/{summary.total} strong
      </p>
      <div className="mt-2">
        <ProgressBar value={summary.weightedPct} height="h-1.5" />
      </div>
    </Card>
  );
}

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

export default function UpscCseDashboard() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const coverage = useAppStore((s) => s.upscCseSyllabusCoverage);
  const attempts = useAppStore((s) => s.upscCsePrelimsPyqAttempts);
  const bookmarkedPyqIds = useAppStore((s) => s.bookmarkedPyqIds);
  const revisionQueue = useAppStore((s) => s.revisionQueue);
  const studyLog = useAppStore((s) => s.studyLog);
  const dailyGoalMinutes = useAppStore((s) => s.dailyGoalMinutes);
  const studyTasks = useAppStore((s) => s.upscCseStudyTasks);
  const addStudyTask = useAppStore((s) => s.addUpscCseStudyTask);
  const setStudyTaskStatus = useAppStore((s) => s.setUpscCseStudyTaskStatus);
  const deleteStudyTask = useAppStore((s) => s.deleteUpscCseStudyTask);

  const today = useMemo(() => getLocalDateString(), []);

  const snapshot = useMemo(
    () =>
      computeUpscCseDashboardSnapshot({
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

  // Study Progress Insights (Phase 4 Step 2) — reuses this workspace's own studyLog (never
  // APFC's/PhD's, see lib/store.ts's workspace-owned fields) and, for the completion percentage,
  // the ALREADY-COMPUTED overallCoverage.weightedPct (lib/upscCseSyllabusCoverage.ts) — never a
  // separately invented UPSC target. weightedPct is already 0-100, so it is passed through as
  // "completed out of 100" rather than re-deriving a completed/total pair from raw coverage
  // counts, which would be a second, possibly-diverging completion calculation.
  const studyProgressInsights = useMemo(
    () => computeStudyProgressInsights({ studyLog, completionTarget: snapshot.overallCoverage.total > 0 ? { completed: snapshot.overallCoverage.weightedPct, total: 100 } : undefined }),
    [studyLog, snapshot.overallCoverage.total, snapshot.overallCoverage.weightedPct],
  );
  const workspaceAccent = getWorkspaceAccent(activeWorkspaceId);

  // Study Activity Trend (Phase 4 Step 4) — reuses buildDailyActivityTrend over the SAME
  // studyLog/today used above; no second date/activity calculation.
  const activityTrend = useMemo(() => buildDailyActivityTrend(studyLog, today, 7), [studyLog, today]);

  // Context-aware encouragement (Phase 4 Step 6) — reuses the EXISTING getEncouragementMessage
  // (lib/gamification.ts, already shown on the APFC Dashboard) with this workspace's own data:
  // today's focus minutes from studyLog, the global dailyGoalMinutes setting (not workspace-owned),
  // the SAME streak already computed above (studyProgressInsights.streak, never a second streak
  // calculation), the SAME overallCoverage.weightedPct already used as the completion target above
  // (never a second UPSC completion number), and whether a UPSC Prelims PYQ test was submitted
  // today.
  const todayMinutes = studyLog[today]?.focusMinutes ?? 0;
  const tookTestToday = attempts.some((a) => a.submittedAt.slice(0, 10) === today);
  const encouragement = getEncouragementMessage({
    todayMinutes,
    dailyGoalMinutes,
    streakCurrent: studyProgressInsights.streak.current,
    syllabusPct: snapshot.overallCoverage.weightedPct,
    tookTestToday,
  });

  const todaysStudyItems = useMemo(
    () =>
      generateTodaysStudyItems({
        coverage,
        prelimsTree: UPSC_CSE_PRELIMS_SYLLABUS,
        mainsTree: UPSC_CSE_MAINS_SYLLABUS,
        granularNodes: UPSC_CSE_GRANULAR_NODES,
        pyqBank: UPSC_CSE_PRELIMS_PYQ_BANK,
        attempts,
        bookmarkedPyqIds,
        revisionQueue,
        today,
      }),
    [coverage, attempts, bookmarkedPyqIds, revisionQueue, today],
  );

  const todaysTasks = useMemo(() => tasksForDate(studyTasks, today), [studyTasks, today]);
  const taskCounts = useMemo(() => countStudyTasksByStatus(todaysTasks), [todaysTasks]);

  const [taskTitle, setTaskTitle] = useState('');
  const [taskMinutes, setTaskMinutes] = useState('');

  function submitNewTask(title: string) {
    if (!isValidStudyTaskTitle(title)) return;
    const minutes = taskMinutes.trim() ? Math.max(1, Math.round(Number(taskMinutes))) : undefined;
    const task = createUpscCseStudyTask({ title, date: today, targetMinutes: Number.isFinite(minutes) ? minutes : undefined }, uuid(), new Date().toISOString());
    addStudyTask(task);
    setTaskTitle('');
    setTaskMinutes('');
  }

  if (activeWorkspaceId !== 'upsc_cse') {
    return (
      <div>
        <PageHeader eyebrow="UPSC CSE" title="Study Dashboard" />
        <WorkspaceComingSoon icon={Compass} workspaceLabel={getWorkspaceMeta(activeWorkspaceId).shortLabel} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="UPSC CSE"
        title="Study Dashboard"
        description="Your syllabus coverage, PYQ practice, revision, and today's study — all in one place."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mb-3">
        {examTargetsForWorkspace('upsc_cse').map((target) => (
          <ExamTargetCard key={target.id} target={target} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <CoverageStatTile label="Overall Coverage" summary={snapshot.overallCoverage} />
        <CoverageStatTile label="Prelims Coverage" summary={snapshot.prelimsCoverage} />
        <CoverageStatTile label="Mains Coverage" summary={snapshot.mainsCoverage} />
        <StatTile label="Questions Attempted" value={`${snapshot.performance?.overall.totalAttempted ?? 0}/${snapshot.totalQuestions}`} />
        <StatTile label="Accuracy" value={snapshot.performance ? `${snapshot.performance.overall.overallAccuracy.toFixed(1)}%` : '—'} tone="brand" />
        <StatTile label="Unanswered Questions" value={`${snapshot.unattemptedCount}`} />
        <StatTile label="Revision Due" value={`${snapshot.revisionDueCount}`} tone={snapshot.revisionDueCount > 0 ? 'danger' : 'neutral'} />
        <StatTile label="Marked for Revision" value={`${snapshot.bookmarkedCount}`} />
      </div>

      <StudyProgressInsightsCard insights={studyProgressInsights} accent={workspaceAccent} progressLabel="Syllabus coverage" className="mt-6" />

      <p className={cx('mt-3 text-sm font-medium', workspaceAccent.text)}>{encouragement}</p>

      <StudyActivityTrend days={activityTrend} accent={workspaceAccent} className="mt-6" />

      <Card className="mt-6 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Flame className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Today's Study</h3>
        </div>
        {todaysStudyItems.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Nothing to study right now — every microsyllabus area is Revised or Strong, and there are no due/incorrect/unattempted questions.
          </p>
        ) : (
          <div className="space-y-2">
            {todaysStudyItems.map((item) => {
              const Icon = KIND_ICON[item.kind];
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.title}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{item.description}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                    <button
                      title="Add as a study task for today"
                      onClick={() => submitNewTask(item.title)}
                      className="rounded-lg p-2 text-slate-300 hover:text-brand-600 dark:text-slate-600 dark:hover:text-brand-400"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <Link to={item.actionHref}>
                      <Button variant="secondary" size="sm">
                        {item.actionLabel}
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="mt-6 p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Today's Tasks</h3>
          </div>
          <p className="text-xs text-slate-400">
            {taskCounts.completed}/{todaysTasks.length} done
          </p>
        </div>

        <form
          className="mb-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            submitNewTask(taskTitle);
          }}
        >
          <input
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="Add a study task for today…"
            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <div className="flex items-center gap-2">
            <div className="relative w-28">
              <Clock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={taskMinutes}
                onChange={(e) => setTaskMinutes(e.target.value)}
                type="number"
                min={1}
                placeholder="mins"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 py-2.5 pl-8 pr-2 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>
            <Button type="submit" disabled={!isValidStudyTaskTitle(taskTitle)}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </form>

        {todaysTasks.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No tasks added for today yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {todaysTasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <button
                  onClick={() => setStudyTaskStatus(task.id, task.status === 'completed' ? 'pending' : 'completed')}
                  className={cx(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                    task.status === 'completed' ? 'border-transparent bg-brand-500' : 'border-slate-300 dark:border-slate-600',
                  )}
                  aria-label={task.status === 'completed' ? 'Mark as pending' : 'Mark as completed'}
                >
                  {task.status === 'completed' && <span className="text-[10px] font-bold text-white">✓</span>}
                </button>
                <span className={cx('min-w-0 flex-1 text-sm truncate', task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-300')}>
                  {task.title}
                </span>
                {task.targetMinutes !== undefined && (
                  <Badge tone="neutral">
                    <Clock className="h-3 w-3" /> {task.targetMinutes}m
                  </Badge>
                )}
                <button
                  onClick={() => deleteStudyTask(task.id)}
                  title="Delete task"
                  className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:text-rose-500 dark:text-slate-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {snapshot.performance && snapshot.performance.weakMicrosyllabus.some((m) => m.attempted > 0) && (
        <Card className="mt-6 p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-rose-500" />
            <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Weak Areas</h3>
          </div>
          <div className="space-y-2">
            {snapshot.performance.weakMicrosyllabus
              .filter((m) => m.attempted > 0)
              .map((m) => (
                <div
                  key={m.microsyllabusId}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    {m.subject && <Badge tone="neutral">{m.subject}</Badge>}
                    <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{m.title}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-xs">
                    <span className="text-emerald-600 dark:text-emerald-400">{m.correct} correct</span>
                    <span className="text-rose-600 dark:text-rose-400">{m.wrong} wrong</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{m.accuracy.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}

      <Card className="mt-6 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <HistoryIcon className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Recent Activity</h3>
        </div>
        {snapshot.recentAttempts.length === 0 && snapshot.recentCompletedTasks.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No study activity yet — take a PYQ test or complete a task to see it here.</p>
        ) : (
          <div className="space-y-2">
            {snapshot.recentAttempts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 text-sm">
                <span className="text-slate-600 dark:text-slate-300">
                  PYQ test — {a.questionIds.length} question{a.questionIds.length === 1 ? '' : 's'}
                </span>
                <span className="text-xs text-slate-400">{new Date(a.submittedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
            ))}
            {snapshot.recentCompletedTasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 text-sm">
                <span className="text-slate-600 dark:text-slate-300">Completed: {t.title}</span>
                <span className="text-xs text-slate-400">{new Date(t.completedAt!).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
