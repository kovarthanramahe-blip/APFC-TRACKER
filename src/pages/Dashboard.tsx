import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Flame,
  Target,
  BookOpenCheck,
  Timer,
  ArrowUpRight,
  TrendingUp,
  CalendarClock,
  Sparkles,
  Trophy,
  Quote as QuoteIcon,
  RefreshCcw,
  ListChecks,
  ListTodo,
  Check,
} from 'lucide-react';
import { useAppStore } from '../lib/store';
import { PYQ_BANK } from '../data/pyq';
import { SYLLABUS, getAllTopicsCount } from '../data/syllabus';
import { useGamification, useRewards, getEncouragementMessage } from '../lib/gamification';
import { computePyqPerformance } from '../lib/pyqPerformance';
import { computeUnifiedTopicStatus, sortByAttentionPriority, type TopicStatus } from '../lib/topicStatus';
import { completeStudyPlanTask } from '../lib/studyPlanEditing';
import { computeDailyStudyQueue, type DailyQueueInput, type DailyQueueItem, type DailyQueueResult } from '../lib/studyPlanDailyQueue';
import { QUOTES, getQuoteIndexForDate } from '../data/quotes';
import { SUBJECT_COLORS, daysUntil, formatDate, formatMinutes, getLocalDateString, cx } from '../lib/utils';
import { Card, ProgressBar, Badge, Button, fadeUp, staggerContainer } from '../components/ui/Primitives';

export default function Dashboard() {
  const completedTopics = useAppStore((s) => s.completedTopics);
  const attempts = useAppStore((s) => s.attempts);
  const pyqAttempts = useAppStore((s) => s.pyqAttempts);
  const sessions = useAppStore((s) => s.sessions);
  const examDate = useAppStore((s) => s.examDate);
  const dailyGoalMinutes = useAppStore((s) => s.dailyGoalMinutes);
  const studyLog = useAppStore((s) => s.studyLog);
  const studyPlan = useAppStore((s) => s.studyPlan);
  const personalStudyPlanTasks = useAppStore((s) => s.personalStudyPlanTasks);
  const setStudyPlanTasks = useAppStore((s) => s.setStudyPlanTasks);
  const setPersonalStudyPlanTasks = useAppStore((s) => s.setPersonalStudyPlanTasks);
  const gami = useGamification();
  const rewards = useRewards();
  const streak = gami.streaks.current;
  // P1 fix #4 — the user's LOCAL calendar date, not UTC's (see lib/utils's getLocalDateString).
  const todayKey = getLocalDateString();
  const todayMinutes = studyLog[todayKey]?.focusMinutes ?? 0;

  const [quoteOverride, setQuoteOverride] = useState<number | null>(null);
  const dailyQuoteIndex = getQuoteIndexForDate(todayKey);
  const quote = QUOTES[quoteOverride ?? dailyQuoteIndex];

  const totalTopics = getAllTopicsCount();
  const doneTopics = Object.values(completedTopics).filter(Boolean).length;
  const overallPct = totalTopics ? Math.round((doneTopics / totalTopics) * 100) : 0;

  const tookTestToday = attempts.some((a) => a.submittedAt.slice(0, 10) === todayKey);
  const encouragement = getEncouragementMessage({
    todayMinutes,
    dailyGoalMinutes,
    streakCurrent: gami.streaks.current,
    syllabusPct: overallPct,
    tookTestToday,
  });

  const days = daysUntil(examDate);

  const avgScore =
    attempts.length > 0
      ? Math.round((attempts.reduce((s, a) => s + (a.score / a.maxScore) * 100, 0) / attempts.length) * 10) / 10
      : null;

  const totalFocusMinutes = sessions.filter((s) => s.mode === 'focus').reduce((sum, s) => sum + s.durationMinutes, 0);

  // Unified topic status: combines syllabus coverage + real PYQ performance (lib/topicStatus),
  // the same single source of truth used by Analytics and Syllabus, so "Needs Attention" here
  // never disagrees with what those pages show for the same topic.
  const pyqPerf = useMemo(() => computePyqPerformance(PYQ_BANK, pyqAttempts), [pyqAttempts]);
  const attentionTopics = useMemo(() => {
    const statuses = computeUnifiedTopicStatus(SYLLABUS, completedTopics, pyqPerf);
    return sortByAttentionPriority(statuses)
      .filter((t) => t.status !== 'strong')
      .slice(0, 5);
  }, [completedTopics, pyqPerf]);

  const recentAttempts = attempts.slice(0, 3);

  // Today's Study (Stage 7) — a read-only daily VIEW over the existing plan (lib/studyPlanDailyQueue),
  // recomputed from current store state on every render. Never persisted, never mutates the plan.
  const dailyQueue = useMemo<DailyQueueResult>(() => {
    const dailyQueueInput: DailyQueueInput = {
      plan: studyPlan,
      personalTasks: personalStudyPlanTasks,
      syllabus: SYLLABUS,
      completedTopics,
      pyqPerf,
      currentDate: todayKey,
    };
    return computeDailyStudyQueue(dailyQueueInput);
  }, [studyPlan, personalStudyPlanTasks, completedTopics, pyqPerf, todayKey]);

  // Completing an item reuses the exact same pure function + store setters StudyPlan.tsx's own
  // Complete action uses — no second task-mutation code path.
  function handleCompleteDailyItem(item: DailyQueueItem) {
    if (item.source === 'study_plan') {
      if (!studyPlan) return;
      const result = completeStudyPlanTask(studyPlan.tasks, item.task.id);
      if (result.ok) setStudyPlanTasks(result.tasks);
    } else {
      const result = completeStudyPlanTask(personalStudyPlanTasks, item.task.id);
      if (result.ok) setPersonalStudyPlanTasks(result.tasks);
    }
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <motion.div {...fadeUp}>
        <Card className="relative overflow-hidden p-6 sm:p-8">
          <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl" />
          <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-gold-400/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Badge tone="gold" className="mb-3">
                <CalendarClock className="h-3 w-3" /> UPSC EPFO · APFC Recruitment Test
              </Badge>
              <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
                {days > 0 ? (
                  <>
                    <span className="bg-gradient-to-r from-brand-600 to-brand-900 dark:from-brand-300 dark:to-gold-300 bg-clip-text text-transparent">
                      {days}
                    </span>{' '}
                    days left
                  </>
                ) : (
                  'Exam day is here'
                )}
              </h1>
              <p className="mt-2 text-sm sm:text-base text-slate-500 dark:text-slate-400">
                Target exam date: <span className="font-semibold text-slate-700 dark:text-slate-200">{formatDate(examDate)}</span>
              </p>
              <div className="mt-3 flex items-start gap-2 max-w-xl">
                <QuoteIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400" />
                <p className="text-sm italic text-slate-600 dark:text-slate-300">{quote}</p>
                <button
                  onClick={() => setQuoteOverride((i) => ((i ?? dailyQuoteIndex) + 1) % QUOTES.length)}
                  title="Show another quote"
                  className="shrink-0 rounded-lg p-1 text-slate-300 hover:text-brand-500 dark:text-slate-600 dark:hover:text-brand-400"
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link to="/mock-tests">
                  <Button>
                    Start a mock test <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/pomodoro">
                  <Button variant="secondary">
                    <Timer className="h-4 w-4" /> Start focus session
                  </Button>
                </Link>
              </div>
            </div>

            <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:grid-cols-5 lg:w-[26rem]">
              <StatTile icon={Target} label="Syllabus" value={`${overallPct}%`} accent="text-brand-600 dark:text-brand-400" />
              <StatTile icon={Flame} label="Streak" value={`${streak}d`} accent="text-orange-500" />
              <StatTile icon={BookOpenCheck} label="Tests" value={`${attempts.length}`} accent="text-emerald-600 dark:text-emerald-400" />
              <StatTile icon={ListChecks} label="PYQs" value={`${pyqAttempts.length}`} accent="text-brand-600 dark:text-brand-400" />
              <StatTile icon={TrendingUp} label="Avg Score" value={avgScore !== null ? `${avgScore}%` : '—'} accent="text-fuchsia-600 dark:text-fuchsia-400" />
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Study progress / gamification */}
      <motion.div {...fadeUp}>
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Study Progress</h3>
            <div className="flex items-center gap-2">
              {rewards.currentTitle && <Badge tone="brand">{rewards.currentTitle}</Badge>}
              <Badge tone="gold">
                <Trophy className="h-3 w-3" /> Level {gami.level.level}
              </Badge>
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">{gami.xp} XP</span>
                <span className="text-slate-400">{gami.level.xpToNext} to next level</span>
              </div>
              <ProgressBar value={gami.level.progressPct} colorClassName="bg-gold-400" height="h-1.5" />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">Today's Goal</span>
                <span className="text-slate-400">
                  {todayMinutes}/{dailyGoalMinutes} min
                </span>
              </div>
              <ProgressBar value={Math.min(100, (todayMinutes / dailyGoalMinutes) * 100)} colorClassName="bg-brand-500" height="h-1.5" />
            </div>
            <div className="flex items-center justify-between sm:block">
              <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                <Flame className="h-4 w-4 text-orange-500" /> {gami.streaks.current}-day streak
              </div>
              <p className="mt-1 text-xs text-slate-400">Best: {gami.streaks.best} days</p>
            </div>
          </div>
          <p className="mt-4 text-sm font-medium text-brand-700 dark:text-brand-300">{encouragement}</p>
          {gami.nextBadge && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5 text-xs text-slate-500 dark:text-slate-400">
              <Sparkles className="h-3.5 w-3.5 text-brand-500 shrink-0" />
              Next achievement: <span className="font-medium text-slate-700 dark:text-slate-200">{gami.nextBadge.title}</span> — {gami.nextBadge.description}
            </div>
          )}
        </Card>
      </motion.div>

      {/* Today's Study (Stage 7) */}
      <motion.div {...fadeUp}>
        <TodayStudyCard queue={dailyQueue} onComplete={handleCompleteDailyItem} />
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Subject progress */}
        <motion.div {...fadeUp} className="min-w-0 lg:col-span-2">
          <Card className="p-5 sm:p-6 h-full">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Subject-wise Progress</h3>
              <Link to="/syllabus" className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
                View syllabus
              </Link>
            </div>
            <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-4">
              {SYLLABUS.map((subj) => {
                const done = subj.topics.filter((t) => completedTopics[t.id]).length;
                const pct = subj.topics.length ? Math.round((done / subj.topics.length) * 100) : 0;
                const colors = SUBJECT_COLORS[subj.colorKey];
                return (
                  <motion.div key={subj.id} variants={fadeUp} className="flex items-center gap-3">
                    <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', colors.dot)} />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{subj.shortTitle}</span>
                        <span className="text-slate-400 dark:text-slate-500">
                          {done}/{subj.topics.length}
                        </span>
                      </div>
                      <ProgressBar value={pct} colorClassName={colors.dot} height="h-1.5" />
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </Card>
        </motion.div>

        {/* Focus + weak areas */}
        <motion.div {...fadeUp} className="min-w-0 space-y-6">
          <Card className="p-5 sm:p-6">
            <h3 className="mb-4 font-display font-semibold text-slate-800 dark:text-slate-100">Study Time</h3>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-3xl font-bold text-slate-900 dark:text-white">{formatMinutes(totalFocusMinutes)}</span>
              <span className="text-xs text-slate-400">total focused time logged</span>
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              {sessions.filter((s) => s.mode === 'focus').length} Pomodoro sessions completed so far.
            </p>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Needs Attention</h3>
              <Link to="/syllabus" className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
                Study topics
              </Link>
            </div>
            {attentionTopics.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">
                {getAllTopicsCount() > 0 ? 'Nice work — every topic is in good shape.' : 'Add syllabus topics to see this here.'}
              </p>
            ) : (
              <ul className="space-y-3">
                {attentionTopics.map((t) => (
                  <li key={t.topicId}>
                    <Link
                      to={`/syllabus?topicId=${encodeURIComponent(t.topicId)}`}
                      className="block rounded-lg -mx-1.5 px-1.5 py-1 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm text-slate-600 dark:text-slate-300">{t.topicTitle}</span>
                        <Badge tone={ATTENTION_TONE[t.status]} className="shrink-0">
                          {ATTENTION_LABEL[t.status]}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {t.covered ? 'Covered' : 'Not covered'}
                        {t.pyqAttempted > 0 ? ` · ${t.pyqAccuracy!.toFixed(0)}% PYQ accuracy (${t.pyqAttempted} attempted)` : ' · No PYQ practice yet'}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </motion.div>
      </div>

      {/* Recent test attempts */}
      <motion.div {...fadeUp}>
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Recent Mock Tests</h3>
            <Link to="/mock-tests" className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
              View all
            </Link>
          </div>
          {recentAttempts.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">No attempts yet. Take your first mock test to see results here.</p>
          ) : (
            <div className="space-y-3">
              {recentAttempts.map((a) => (
                <Link
                  key={a.id}
                  to={`/mock-tests/result/${a.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-200/70 dark:border-slate-800 px-4 py-3 hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{a.blueprintTitle}</p>
                    <p className="text-xs text-slate-400">{new Date(a.submittedAt).toLocaleString('en-IN')}</p>
                  </div>
                  <Badge tone={a.score / a.maxScore >= 0.6 ? 'success' : 'danger'}>
                    {a.score.toFixed(2)} / {a.maxScore}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}

const TODAY_STATE_MESSAGE: Record<Extract<DailyQueueResult, { status: 'active' }>['todayState'], string | null> = {
  rest_day: "Today's a rest day — no study tasks are scheduled.",
  no_tasks_scheduled: "Nothing scheduled today — here's what's coming up.",
  all_completed: "All of today's tasks are done — nice work.",
  pending: null,
};

/** Stage 7 — a compact daily view over the existing plan (lib/studyPlanDailyQueue). Purely
 * derived from current store state on every render; nothing here is persisted, and the "Complete"
 * action reuses the same pure completeStudyPlanTask + store setters the Study Plan page itself
 * uses — this component never mutates a task's date or generates a second schedule. */
function TodayStudyCard({ queue, onComplete }: { queue: DailyQueueResult; onComplete: (item: DailyQueueItem) => void }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Today's Study</h3>
        </div>
        <Link to="/study-plan" className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
          Open Study Plan
        </Link>
      </div>

      {queue.status === 'no_plan' && (
        <p className="text-sm text-slate-400 dark:text-slate-500">No study plan yet — generate one to see what to study today.</p>
      )}

      {queue.status === 'plan_completed' && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">Your study plan is fully complete — nothing left to do.</p>
      )}

      {queue.status === 'active' && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Planned" value={formatMinutes(queue.capacity.plannedMinutes)} />
            <MiniStat label="Completed" value={formatMinutes(queue.capacity.completedMinutes)} />
            <MiniStat label="Remaining" value={formatMinutes(queue.capacity.remainingMinutes)} />
            <MiniStat label="Overdue" value={`${queue.overdueTasks.length}`} tone={queue.overdueTasks.length > 0 ? 'danger' : 'neutral'} />
          </div>

          <div className="mt-3">
            <ProgressBar
              value={queue.capacity.plannedMinutes > 0 ? (queue.capacity.completedMinutes / queue.capacity.plannedMinutes) * 100 : 0}
              colorClassName="bg-brand-500"
              height="h-1.5"
            />
          </div>

          {queue.capacity.overCapacity && (
            <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">Today's scheduled work exceeds your configured daily time.</p>
          )}

          {TODAY_STATE_MESSAGE[queue.todayState] && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{TODAY_STATE_MESSAGE[queue.todayState]}</p>}

          <DoNextList queue={queue} onComplete={onComplete} />
        </>
      )}
    </Card>
  );
}

function MiniStat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'danger' }) {
  return (
    <div className="rounded-xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800 px-3 py-2.5">
      <p className={cx('font-display text-base font-bold', tone === 'danger' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white')}>{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}

/** The "Do Next" list — recommendedOrder (overdue + today's pending, reordered by priority only)
 * when there's anything to show; falls back to the small nextUp preview when today has nothing
 * outstanding (rest day / nothing scheduled / today fully done), so "what should I do next?"
 * always has an answer when there's any upcoming work at all. */
function DoNextList({ queue, onComplete }: { queue: Extract<DailyQueueResult, { status: 'active' }>; onComplete: (item: DailyQueueItem) => void }) {
  const items = queue.recommendedOrder.length > 0 ? queue.recommendedOrder.slice(0, 5) : queue.nextUp;
  if (items.length === 0) return null;

  return (
    <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Do Next</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg -mx-1.5 px-1.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60">
            <div className="min-w-0">
              <p className="truncate text-sm text-slate-700 dark:text-slate-200">{item.task.title}</p>
              <p className="truncate text-[11px] text-slate-400">
                {item.reason} · {item.estimatedMinutes} min
              </p>
            </div>
            <button
              type="button"
              title="Mark complete"
              onClick={() => onComplete(item)}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ATTENTION_LABEL: Record<TopicStatus, string> = {
  needs_coverage: 'Needs Coverage',
  not_started: 'Not Started',
  needs_practice: 'Needs Practice',
  needs_revision: 'Needs Revision',
  strong: 'Strong',
};

const ATTENTION_TONE: Record<TopicStatus, 'danger' | 'neutral' | 'warning' | 'success'> = {
  needs_coverage: 'danger',
  not_started: 'neutral',
  needs_practice: 'warning',
  needs_revision: 'warning',
  strong: 'success',
};

function StatTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800 px-3 py-2.5">
      <Icon className={cx('h-4 w-4 mb-1.5', accent)} strokeWidth={2.2} />
      <p className="font-display text-lg font-bold text-slate-900 dark:text-white leading-none">{value}</p>
      <p className="text-[11px] text-slate-400 mt-1">{label}</p>
    </div>
  );
}
