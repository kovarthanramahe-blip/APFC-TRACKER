import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Award, Lock, Trophy, Gem, Star, ListChecks, ArrowUpRight, TrendingDown, TrendingUp, ClipboardList, Brain, Gauge } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { getWorkspaceMeta } from '../lib/workspace';
import { getWorkspaceAccent } from '../lib/workspaceAccent';
import { buildDailyActivityTrend } from '../lib/studyProgressInsights';
import { StudyActivityTrend } from '../components/ui/StudyActivityTrend';
import { PYQ_BANK } from '../data/pyq';
import { SYLLABUS, getAllTopicsCount } from '../data/syllabus';
import { BADGES, useGamification, useRewards, REWARDS } from '../lib/gamification';
import { computeAggregateAccuracy } from '../lib/mockTestStats';
import { computePyqPerformance } from '../lib/pyqPerformance';
import { computeUnifiedTopicStatus } from '../lib/topicStatus';
import { computeStudyPlanProgress, type ExecutionState, type StudyPlanProgressResult } from '../lib/studyPlanProgress';
import type { PlanTaskType } from '../lib/studyPlan';
import { computeRevisionStatusMap, computeEligibleRevisionIds } from '../lib/pyqFilters';
import { getQueueCounts, type RevisionQueueCounts } from '../lib/revisionQueue';
import { computeExamReadiness, type ExamReadinessReport, type ExamReadinessVerdict } from '../lib/examReadiness';
import { selectWeakTopicPracticeIds } from '../lib/weakTopicPractice';
import { SUBJECT_COLORS, formatMinutes, formatDate, getLocalDateString, cx } from '../lib/utils';
import { Card, Badge, Button, ProgressBar, PageHeader, fadeUp, WorkspaceComingSoon } from '../components/ui/Primitives';

export default function Analytics() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const completedTopics = useAppStore((s) => s.completedTopics);
  const attempts = useAppStore((s) => s.attempts);
  const pyqAttempts = useAppStore((s) => s.pyqAttempts);
  const studyLog = useAppStore((s) => s.studyLog);
  const rewardUnlocks = useAppStore((s) => s.rewardUnlocks);
  const studyPlan = useAppStore((s) => s.studyPlan);
  const personalStudyPlanTasks = useAppStore((s) => s.personalStudyPlanTasks);
  const sessions = useAppStore((s) => s.sessions);
  const bookmarkedPyqIds = useAppStore((s) => s.bookmarkedPyqIds);
  const revisionQueue = useAppStore((s) => s.revisionQueue);
  const gami = useGamification();
  const rewards = useRewards();

  // Same computePyqPerformance helper PYQTest.tsx's own "Performance" view uses — one source of
  // truth for PYQ aggregation, so the two views can never disagree.
  const pyqPerf = useMemo(() => computePyqPerformance(PYQ_BANK, pyqAttempts), [pyqAttempts]);

  // Revision Queue summary (Stage 3) — reuses lib/revisionQueue's getQueueCounts and
  // lib/pyqFilters' computeEligibleRevisionIds verbatim; no second scheduling/eligibility engine.
  const revisionCounts: RevisionQueueCounts = useMemo(() => {
    const statusMap = computeRevisionStatusMap(PYQ_BANK, pyqAttempts);
    const eligibleIds = computeEligibleRevisionIds(PYQ_BANK, statusMap, bookmarkedPyqIds);
    return getQueueCounts(revisionQueue, eligibleIds, getLocalDateString());
  }, [pyqAttempts, bookmarkedPyqIds, revisionQueue]);

  // "Basic review activity" from the queue's own already-stored metadata (reviewCount per item) —
  // no new tracking, just a sum over what lib/revisionQueue already persists.
  const totalRevisionReviews = useMemo(() => Object.values(revisionQueue).reduce((sum, item) => sum + item.reviewCount, 0), [revisionQueue]);

  // Connects the "Needs Improvement" ranking (pure PYQ accuracy, unchanged) to the unified
  // topic-status verdict (lib/topicStatus) — a low accuracy from only 1-2 questions isn't the
  // same actionable signal as a genuinely low accuracy over many, so the two are labeled distinctly.
  const topicStatuses = useMemo(() => computeUnifiedTopicStatus(SYLLABUS, completedTopics, pyqPerf), [completedTopics, pyqPerf]);
  const unifiedByTopic = useMemo(() => new Map(topicStatuses.map((t) => [t.topicId, t.status])), [topicStatuses]);

  // Weak-Topic Practice (Stage 3 entry points) — reuses lib/weakTopicPractice's
  // selectWeakTopicPracticeIds (Stage 1) verbatim against the same topicStatuses computed above;
  // no second weak-topic selection logic. Just a count, used to show/hide the "Practice Weak
  // Topics" links below — the actual session lives entirely on the PYQs page.
  const weakTopicPracticeIds = useMemo(() => selectWeakTopicPracticeIds(topicStatuses, PYQ_BANK), [topicStatuses]);

  const recentlyUnlocked = [...rewards.unlocked]
    .filter((r) => rewardUnlocks[r.id])
    .sort((a, b) => (rewardUnlocks[b.id] > rewardUnlocks[a.id] ? 1 : -1))[0];

  const totalTopics = getAllTopicsCount();
  const doneTopics = Object.values(completedTopics).filter(Boolean).length;

  const pieData = SYLLABUS.map((s) => {
    const done = s.topics.filter((t) => completedTopics[t.id]).length;
    return { name: s.shortTitle, value: done, colorKey: s.colorKey };
  }).filter((d) => d.value > 0);

  // Study Activity Trend (Phase 4 Step 5) — reuses buildDailyActivityTrend (lib/studyProgressInsights.ts),
  // the same canonical calculation the APFC/UPSC CSE/PhD Research dashboards already use, replacing
  // this page's own former ad-hoc lastNDays/focusData (UTC-based, never reused elsewhere).
  const workspaceAccent = getWorkspaceAccent(activeWorkspaceId);
  const activityTrend = useMemo(() => buildDailyActivityTrend(studyLog, getLocalDateString(), 7), [studyLog]);

  const scoreTrend = useMemo(
    () =>
      [...attempts]
        .reverse()
        .map((a, i) => ({
          attempt: `#${i + 1}`,
          percentage: Math.round((a.score / a.maxScore) * 1000) / 10,
        })),
    [attempts],
  );

  const totalFocusMinutes = Object.values(studyLog).reduce((sum, e) => sum + e.focusMinutes, 0);
  const totalTestsTaken = attempts.length;
  const avgAccuracy = computeAggregateAccuracy(attempts);

  // Study Plan Progress (Stage 8) — a read-only execution-analytics view (lib/studyPlanProgress),
  // recomputed from current store state on every render; never persisted, never mutates the plan
  // or `sessions`. Reuses the app's EXISTING actual-activity record (PomodoroSession) rather than
  // inventing a second study-history model.
  // P1 fix #4 — the user's LOCAL calendar date, not UTC's (see lib/utils's getLocalDateString).
  const planProgress: StudyPlanProgressResult = useMemo(
    () => computeStudyPlanProgress({ plan: studyPlan, personalTasks: personalStudyPlanTasks, sessions, currentDate: getLocalDateString() }),
    [studyPlan, personalStudyPlanTasks, sessions],
  );

  // Exam Readiness (Stage 3) — the same read-only composite (lib/examReadiness) shown on the
  // Dashboard, reused verbatim here with no second scoring calculation. No historical snapshot of
  // past readiness is stored anywhere in this app (completedTopics carries no completion dates), so
  // a trend/comparison view is intentionally NOT built — it would have to fabricate history.
  const examReadiness: ExamReadinessReport = useMemo(
    () =>
      computeExamReadiness({
        syllabus: SYLLABUS,
        completedTopics,
        pyqPerf,
        pyqBank: PYQ_BANK,
        pyqAttempts,
        bookmarkedPyqIds,
        revisionQueue,
        mockTestAttempts: attempts,
        studyPlan,
        personalTasks: personalStudyPlanTasks,
        sessions,
        currentDate: getLocalDateString(),
      }),
    [completedTopics, pyqPerf, pyqAttempts, bookmarkedPyqIds, revisionQueue, attempts, studyPlan, personalStudyPlanTasks, sessions],
  );

  // Multi-Workspace OS, Stage 3A — Analytics is built entirely from SYLLABUS-derived progress and
  // PYQ performance (APFC's own real data); showing zeroed-out APFC charts under a different
  // workspace's branding would still be showing APFC's structure, not this workspace's.
  if (activeWorkspaceId !== 'apfc') {
    return (
      <div>
        <PageHeader eyebrow="Insights" title="Analytics" />
        <WorkspaceComingSoon icon={ListChecks} workspaceLabel={getWorkspaceMeta(activeWorkspaceId).shortLabel} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader eyebrow="Insights" title="Analytics" description="Track your preparation trends across syllabus coverage, study time and test performance." />

      <motion.div {...fadeUp} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <p className="text-xs text-slate-400 mb-1">Total Focused Time</p>
          <p className="font-display text-2xl font-bold text-slate-900 dark:text-white">{formatMinutes(totalFocusMinutes)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-slate-400 mb-1">Tests Taken</p>
          <p className="font-display text-2xl font-bold text-slate-900 dark:text-white">{totalTestsTaken}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-slate-400 mb-1">Average Accuracy</p>
          <p className="font-display text-2xl font-bold text-slate-900 dark:text-white">{avgAccuracy}%</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-slate-400 mb-1">Level & XP</p>
          <p className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {gami.level.level} <span className="text-sm font-medium text-slate-400">· {gami.xp} XP</span>
          </p>
        </Card>
      </motion.div>

      <motion.div {...fadeUp} className="mb-6">
        <ExamReadinessCard report={examReadiness} hasWeakTopicPractice={weakTopicPracticeIds.length > 0} />
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div {...fadeUp}>
          <StudyActivityTrend days={activityTrend} accent={workspaceAccent} className="h-full" />
        </motion.div>

        <motion.div {...fadeUp}>
          <Card className="p-5 sm:p-6 h-full">
            <h3 className="mb-4 font-display font-semibold text-slate-800 dark:text-slate-100">Mock Test Score Trend</h3>
            {scoreTrend.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-slate-400">Take a few mock tests to see your trend.</div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={scoreTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
                    <XAxis dataKey="attempt" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" unit="%" />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Line type="monotone" dataKey="percentage" stroke="#d1922a" strokeWidth={2.5} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </motion.div>

        <motion.div {...fadeUp} className="lg:col-span-2">
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Syllabus Coverage by Subject</h3>
              <p className="text-xs text-slate-400">
                {doneTopics}/{totalTopics} topics overall
              </p>
            </div>
            {pieData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-slate-400">Start checking off syllabus topics to see coverage here.</div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="h-64 w-64 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                        {pieData.map((d) => (
                          <Cell key={d.name} fill={SUBJECT_COLORS[d.colorKey].chart} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid flex-1 grid-cols-2 gap-2">
                  {pieData.map((d) => (
                    <div key={d.name} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: SUBJECT_COLORS[d.colorKey].chart }} />
                      <span className="text-slate-600 dark:text-slate-300 truncate">{d.name}</span>
                      <span className="ml-auto text-slate-400">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </motion.div>
      </div>

      <motion.div {...fadeUp} className="mt-6">
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">PYQ Performance</h3>
            </div>
            <Link to="/pyq-test">
              <Button variant="secondary" size="sm">
                Practice PYQs <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          {!pyqPerf ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <ListChecks className="h-8 w-8 text-slate-300 dark:text-slate-700 mb-2" />
              <p className="text-sm text-slate-400">Take a PYQ test to see your performance here.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <PyqStat label="Attempted" value={`${pyqPerf.overall.totalAttempted}`} />
                <PyqStat label="Accuracy" value={`${pyqPerf.overall.overallAccuracy.toFixed(1)}%`} tone="brand" />
                <PyqStat label="Tests Taken" value={`${pyqPerf.overall.testsCompleted}`} />
                <PyqStat label="Remaining" value={`${pyqPerf.unattemptedCount}`} />
                <PyqStat label="Best Subject" value={pyqPerf.strongestSubject?.subjectTitle ?? '—'} tone="success" small />
                <PyqStat label="Weakest Subject" value={pyqPerf.weakestSubject?.subjectTitle ?? '—'} tone="danger" small />
              </div>

              {pyqPerf.years.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">By Year</p>
                  <div className="space-y-2">
                    {pyqPerf.years.map((y) => (
                      <div
                        key={y.year}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 text-xs"
                      >
                        <Badge tone="neutral">{y.year}</Badge>
                        <div className="flex flex-wrap items-center gap-3 text-slate-500 dark:text-slate-400">
                          <span>{y.attempted} attempted</span>
                          <span className="text-emerald-600 dark:text-emerald-400">{y.correct} correct</span>
                          <span className="text-rose-600 dark:text-rose-400">{y.wrong} wrong</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-200">{y.accuracy.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pyqPerf.subjects.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">By Subject</p>
                  <div className="space-y-2">
                    {pyqPerf.subjects.map((s) => (
                      <div key={s.subject} className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">{s.subjectTitle}</span>
                        <div className="flex shrink-0 items-center gap-3 text-slate-400">
                          <span>{s.attempted} attempted</span>
                          <Badge tone={s.accuracy >= 60 ? 'success' : s.accuracy > 0 ? 'danger' : 'neutral'}>
                            {s.attempted > 0 ? `${s.accuracy.toFixed(1)}%` : '—'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(pyqPerf.weakTopics.length > 0 || pyqPerf.strongestTopics.length > 0) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <TrendingDown className="h-3.5 w-3.5 text-rose-500" /> Needs Improvement
                      </div>
                      {weakTopicPracticeIds.length > 0 && (
                        <Link to="/pyq-test?mode=weak_topics" className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline">
                          Practice Weak Topics
                        </Link>
                      )}
                    </div>
                    <ul className="space-y-2">
                      {pyqPerf.weakTopics.slice(0, 4).map((t) => {
                        const unified = unifiedByTopic.get(t.topicId);
                        const lowSample = unified === 'needs_practice';
                        return (
                          <li key={t.topicId}>
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">{t.topicTitle}</span>
                              <Badge tone={lowSample ? 'warning' : 'danger'}>{t.accuracy.toFixed(0)}%</Badge>
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-400">
                              {lowSample ? `Low sample (${t.attempted} attempted) — practice more before judging` : 'Needs revision'}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Strongest
                    </div>
                    <ul className="space-y-2">
                      {pyqPerf.strongestTopics.slice(0, 4).map((t) => (
                        <li key={t.topicId} className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">{t.topicTitle}</span>
                          <Badge tone="success">{t.accuracy.toFixed(0)}%</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </motion.div>

      <motion.div {...fadeUp} className="mt-6">
        <RevisionQueueCard counts={revisionCounts} totalReviews={totalRevisionReviews} />
      </motion.div>

      <motion.div {...fadeUp} className="mt-6">
        <StudyPlanProgressCard progress={planProgress} />
      </motion.div>

      <motion.div {...fadeUp} className="mt-6">
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Rewards</h3>
            <div className="flex items-center gap-2">
              {rewards.currentTitle && <Badge tone="brand">{rewards.currentTitle}</Badge>}
              <Badge tone="gold">
                <Gem className="h-3 w-3" /> {rewards.unlocked.length}/{REWARDS.length} unlocked
              </Badge>
            </div>
          </div>

          {recentlyUnlocked && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-gold-50 dark:bg-gold-500/10 border border-gold-200/60 dark:border-gold-500/20 px-3.5 py-2.5 text-xs text-gold-800 dark:text-gold-300">
              <Star className="h-3.5 w-3.5 shrink-0" />
              Most recent: <span className="font-medium">{recentlyUnlocked.title}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 mb-4">
            {REWARDS.map((reward) => {
              const earned = rewards.unlocked.some((r) => r.id === reward.id);
              return (
                <div
                  key={reward.id}
                  className={cx(
                    'flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center',
                    earned
                      ? 'border-brand-300/60 bg-brand-50 dark:bg-brand-500/10 dark:border-brand-500/30'
                      : 'border-slate-200 dark:border-slate-800 opacity-60',
                  )}
                >
                  {earned ? (
                    reward.kind === 'title' ? (
                      <Star className="h-5 w-5 text-brand-500" />
                    ) : (
                      <Gem className="h-5 w-5 text-brand-500" />
                    )
                  ) : (
                    <Lock className="h-5 w-5 text-slate-300 dark:text-slate-600" />
                  )}
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-200">{reward.title}</p>
                  <p className="text-[11px] text-slate-400 leading-tight">{reward.description}</p>
                </div>
              );
            })}
          </div>

          {rewards.nextReward && (
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  Next: <span className="font-medium text-slate-700 dark:text-slate-200">{rewards.nextReward.title}</span>
                </span>
                <span className="text-slate-400">{Math.round(rewards.nextReward.progress(rewards.context))}%</span>
              </div>
              <ProgressBar value={rewards.nextReward.progress(rewards.context)} colorClassName="bg-brand-500" height="h-1.5" />
            </div>
          )}
        </Card>
      </motion.div>

      <motion.div {...fadeUp} className="mt-6">
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Achievements</h3>
            <Badge tone="gold">
              <Trophy className="h-3 w-3" /> {gami.earnedBadges.length}/{BADGES.length} earned
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {BADGES.map((badge) => {
              const earned = gami.earnedBadges.some((b) => b.id === badge.id);
              return (
                <div
                  key={badge.id}
                  className={cx(
                    'flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center',
                    earned
                      ? 'border-gold-300/60 bg-gold-50 dark:bg-gold-500/10 dark:border-gold-500/30'
                      : 'border-slate-200 dark:border-slate-800 opacity-60',
                  )}
                >
                  {earned ? <Award className="h-5 w-5 text-gold-500" /> : <Lock className="h-5 w-5 text-slate-300 dark:text-slate-600" />}
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-200">{badge.title}</p>
                  <p className="text-[11px] text-slate-400 leading-tight">{badge.description}</p>
                </div>
              );
            })}
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

// Keeps "Weekly Progress" compact on a long (e.g. full-year) plan — lib/studyPlanProgress itself
// still returns every week; this is a display-only slice, favoring the elapsed/current weeks
// (the ones with real data) over far-future weeks that are necessarily still all zeroes.
const MAX_WEEKS_SHOWN = 6;

function recentWeeks(progress: Extract<StudyPlanProgressResult, { status: 'ready' }>) {
  const elapsedOrCurrent = progress.weeklyProgress.filter((w) => w.weekStart <= progress.currentDate);
  const base = elapsedOrCurrent.length > 0 ? elapsedOrCurrent : progress.weeklyProgress;
  return base.slice(-MAX_WEEKS_SHOWN);
}

// P2 — tones match PyqStat's own supported set (no 'warning' there), and are read directly below
// instead of a separate ad-hoc rule, so 'inactive' renders visually distinct from 'on_track'
// rather than sharing the same blue as a healthy state.
const EXECUTION_STATE_META: Record<ExecutionState, { label: string; tone: 'success' | 'brand' | 'danger' | 'neutral' }> = {
  ahead: { label: 'Ahead', tone: 'success' },
  on_track: { label: 'On Track', tone: 'brand' },
  behind: { label: 'Behind', tone: 'danger' },
  inactive: { label: 'Inactive', tone: 'neutral' },
};

// A small, clearly-labelled local copy of lib/studyPlan's own task-type wording — this stage
// deliberately doesn't export a new surface from studyPlan.ts (left completely unmodified), same
// convention studyPlanAdaptive.ts's ADAPTIVE_TASK_TYPE_TITLE already established.
const TASK_TYPE_TITLE: Record<PlanTaskType, string> = {
  coverage: 'Coverage',
  revision: 'Revision',
  pyq_practice: 'PYQ Practice',
  review: 'Review',
};

// Same verdict thresholds/labels as lib/examReadiness's own ExamReadinessVerdict — a page-local
// presentation mapping only (tone + bar color), same convention as EXECUTION_STATE_META above.
const READINESS_VERDICT_META: Record<ExamReadinessVerdict, { label: string; tone: 'danger' | 'warning' | 'success'; barColor: string }> = {
  needs_work: { label: 'Needs Work', tone: 'danger', barColor: 'bg-rose-500' },
  getting_there: { label: 'Getting There', tone: 'warning', barColor: 'bg-amber-400' },
  exam_ready: { label: 'Exam Ready', tone: 'success', barColor: 'bg-emerald-500' },
};

/** Exam Readiness Stage 3 — a read-only capstone summary over lib/examReadiness's composite score
 * (the same computation Dashboard's card uses). No scoring/weighting happens here; this only
 * renders the already-computed report (overallScore, verdict, weakestDimension, dimensions). No
 * historical trend is shown — completedTopics has no completion dates, so a past readiness state
 * can't be faithfully reconstructed from existing stored data without inventing a new history model. */
function ExamReadinessCard({ report, hasWeakTopicPractice }: { report: ExamReadinessReport; hasWeakTopicPractice: boolean }) {
  const meta = READINESS_VERDICT_META[report.verdict];
  // Stage 3 — only the 'syllabus' dimension is built from topic-strength status (lib/topicStatus),
  // the exact same signal lib/weakTopicPractice selects PYQs from; the other four dimensions
  // aren't "topic weakness" in that sense, so no practice link is shown when one of those is weakest.
  const canPracticeWeakestArea = report.weakestDimension.dimension === 'syllabus' && hasWeakTopicPractice;
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Exam Readiness</h3>
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <PyqStat label="Overall Score" value={`${report.overallScore}/100`} tone="brand" />
        {report.dimensions.map((d) => (
          <PyqStat
            key={d.dimension}
            label={d.label}
            value={d.hasData ? `${d.score}%` : '—'}
            tone={!d.hasData ? 'neutral' : d.score >= 70 ? 'success' : d.score >= 40 ? 'brand' : 'danger'}
            small
          />
        ))}
      </div>

      <div className="mt-4">
        <ProgressBar value={report.overallScore} colorClassName={meta.barColor} height="h-1.5" />
      </div>

      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Weakest area: <span className="font-medium text-slate-700 dark:text-slate-200">{report.weakestDimension.label}</span> — {report.weakestDimension.reason}
      </p>

      {canPracticeWeakestArea && (
        <Link to="/pyq-test?mode=weak_topics" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
          Practice Weak Topics <ArrowUpRight className="h-3 w-3" />
        </Link>
      )}
    </Card>
  );
}

/** Stage 8 — "how well am I actually executing the study plan?": planned work vs completed
 * planned work vs actual study activity (lib/studyPlanProgress). Purely derived from current store
 * state on every render; nothing here is persisted, and nothing here can move or complete a task —
 * read-only analytics only. */
function StudyPlanProgressCard({ progress }: { progress: StudyPlanProgressResult }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Study Plan Progress</h3>
        </div>
        <Link to="/study-plan" className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
          Open Study Plan
        </Link>
      </div>

      {progress.status === 'no_plan' ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">No study plan yet — generate one on the Study Plan page to see execution analytics here.</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <PyqStat label="Plan Completion" value={`${progress.taskCompletion.completionPct}%`} tone="brand" />
            <PyqStat label="Planned Time" value={formatMinutes(progress.plannedMinutes.plannedMinutes)} />
            <PyqStat label="Completed Time" value={formatMinutes(progress.plannedMinutes.completedMinutes)} tone="success" />
            <PyqStat label="Actual Study Time" value={formatMinutes(progress.actualStudyTime.actualStudyMinutes)} />
            <PyqStat label="Execution" value={EXECUTION_STATE_META[progress.executionState].label} tone={EXECUTION_STATE_META[progress.executionState].tone} small />
            <PyqStat label="Overdue" value={`${progress.overdue.overduePendingCount}`} tone={progress.overdue.overduePendingCount > 0 ? 'danger' : 'neutral'} />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Planned time completed</span>
              <span className="text-slate-400">{progress.plannedMinutes.completionPct}%</span>
            </div>
            <ProgressBar value={progress.plannedMinutes.completionPct} colorClassName="bg-brand-500" height="h-1.5" />
          </div>

          {progress.recommendations[0] && <p className="text-xs text-brand-700 dark:text-brand-300">{progress.recommendations[0]}</p>}

          {/* P1 fix #3 — Plan Progress and Plan Health (Study Plan page) answer different
              questions and can legitimately disagree; this line is the only thing that changed
              here, no new logic. */}
          <p className="text-[11px] text-slate-400">
            Plan Progress checks whether your actual pace matches the plan so far. See Plan Health on the Study Plan page for whether your remaining workload still fits your remaining time.
          </p>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">By Task Type</p>
            <div className="space-y-2">
              {(Object.keys(TASK_TYPE_TITLE) as PlanTaskType[]).map((type) => {
                const t = progress.taskTypeProgress[type];
                if (t.planned === 0) return null;
                return (
                  <div key={type} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">{TASK_TYPE_TITLE[type]}</span>
                    <div className="flex shrink-0 items-center gap-3 text-slate-400">
                      <span>
                        {t.completed}/{t.planned}
                      </span>
                      <Badge tone={t.completionPct >= 60 ? 'success' : t.completionPct > 0 ? 'warning' : 'neutral'}>{t.completionPct}%</Badge>
                    </div>
                  </div>
                );
              })}
              {progress.personalTaskTypeProgress.personal.planned > 0 && (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">Personal</span>
                  <div className="flex shrink-0 items-center gap-3 text-slate-400">
                    <span>
                      {progress.personalTaskTypeProgress.personal.completed}/{progress.personalTaskTypeProgress.personal.planned}
                    </span>
                    <Badge tone="neutral">{progress.personalTaskTypeProgress.personal.completionPct}%</Badge>
                  </div>
                </div>
              )}
            </div>
          </div>

          {progress.weeklyProgress.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Weekly Progress</p>
                {progress.weeklyProgress.length > MAX_WEEKS_SHOWN && (
                  <p className="text-[11px] text-slate-400">Most recent {MAX_WEEKS_SHOWN} of {progress.weeklyProgress.length} weeks</p>
                )}
              </div>
              <div className="space-y-2">
                {recentWeeks(progress).map((w) => (
                  <div
                    key={w.weekStart}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 text-xs"
                  >
                    <span className="text-slate-500 dark:text-slate-400">
                      {formatDate(w.weekStart)} – {formatDate(w.weekEnd)}
                    </span>
                    <div className="flex flex-wrap items-center gap-3 text-slate-500 dark:text-slate-400">
                      <span>
                        {w.completedTaskCount}/{w.plannedTaskCount} tasks
                      </span>
                      <span>{formatMinutes(w.actualStudyMinutes)} actual</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{w.executionPercentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** Revision Queue Stage 3 — a compact, read-only summary of the existing revision queue
 * (lib/revisionQueue). Reuses getQueueCounts/computeEligibleRevisionIds verbatim; no new
 * scheduling or eligibility logic, and nothing here mutates the queue or PYQ data. */
function RevisionQueueCard({ counts, totalReviews }: { counts: RevisionQueueCounts; totalReviews: number }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Revision Queue</h3>
        </div>
        <Link to="/pyq-test" className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
          Revise Now
        </Link>
      </div>

      {counts.totalTracked === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">
          No PYQs are eligible for revision yet — questions you answer incorrectly or bookmark will show up here.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <PyqStat label="Eligible" value={`${counts.totalTracked}`} />
          <PyqStat label="Due Now" value={`${counts.dueCount}`} tone={counts.dueCount > 0 ? 'brand' : 'neutral'} />
          <PyqStat label="Mastered" value={`${counts.masteredCount}`} tone="success" />
          <PyqStat label="Total Reviews" value={`${totalReviews}`} />
        </div>
      )}
    </Card>
  );
}

function PyqStat({
  label,
  value,
  tone = 'neutral',
  small = false,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'brand' | 'success' | 'danger';
  small?: boolean;
}) {
  const tones: Record<string, string> = {
    neutral: 'text-slate-800 dark:text-slate-100',
    brand: 'text-brand-600 dark:text-brand-400',
    success: 'text-emerald-600 dark:text-emerald-400',
    danger: 'text-rose-600 dark:text-rose-400',
  };
  return (
    <div className="rounded-xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800 px-3 py-2.5">
      <p className={cx('font-display font-bold leading-tight truncate', small ? 'text-sm' : 'text-lg', tones[tone])}>{value}</p>
      <p className="text-[11px] text-slate-400 mt-1">{label}</p>
    </div>
  );
}
