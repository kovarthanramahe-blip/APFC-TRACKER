import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Award, Lock, Trophy, Gem, Star, ListChecks, ArrowUpRight, TrendingDown, TrendingUp } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { PYQ_BANK } from '../data/pyq';
import { SYLLABUS, getAllTopicsCount } from '../data/syllabus';
import { BADGES, useGamification, useRewards, REWARDS } from '../lib/gamification';
import { computeAggregateAccuracy } from '../lib/mockTestStats';
import { computePyqPerformance } from '../lib/pyqPerformance';
import { SUBJECT_COLORS, formatMinutes, cx } from '../lib/utils';
import { Card, Badge, Button, ProgressBar, PageHeader, fadeUp } from '../components/ui/Primitives';

function lastNDays(n: number) {
  const days: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const dd = new Date(d);
    dd.setDate(d.getDate() - i);
    days.push(dd.toISOString().slice(0, 10));
  }
  return days;
}

export default function Analytics() {
  const completedTopics = useAppStore((s) => s.completedTopics);
  const attempts = useAppStore((s) => s.attempts);
  const pyqAttempts = useAppStore((s) => s.pyqAttempts);
  const studyLog = useAppStore((s) => s.studyLog);
  const rewardUnlocks = useAppStore((s) => s.rewardUnlocks);
  const gami = useGamification();
  const rewards = useRewards();

  // Same computePyqPerformance helper PYQTest.tsx's own "Performance" view uses — one source of
  // truth for PYQ aggregation, so the two views can never disagree.
  const pyqPerf = useMemo(() => computePyqPerformance(PYQ_BANK, pyqAttempts), [pyqAttempts]);

  const recentlyUnlocked = [...rewards.unlocked]
    .filter((r) => rewardUnlocks[r.id])
    .sort((a, b) => (rewardUnlocks[b.id] > rewardUnlocks[a.id] ? 1 : -1))[0];

  const totalTopics = getAllTopicsCount();
  const doneTopics = Object.values(completedTopics).filter(Boolean).length;

  const pieData = SYLLABUS.map((s) => {
    const done = s.topics.filter((t) => completedTopics[t.id]).length;
    return { name: s.shortTitle, value: done, colorKey: s.colorKey };
  }).filter((d) => d.value > 0);

  const focusData = useMemo(
    () =>
      lastNDays(14).map((date) => ({
        date: date.slice(5),
        minutes: studyLog[date]?.focusMinutes ?? 0,
      })),
    [studyLog],
  );

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

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div {...fadeUp}>
          <Card className="p-5 sm:p-6 h-full">
            <h3 className="mb-4 font-display font-semibold text-slate-800 dark:text-slate-100">Focus Minutes — Last 14 Days</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={focusData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Bar dataKey="minutes" fill="#3161ee" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
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
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <TrendingDown className="h-3.5 w-3.5 text-rose-500" /> Needs Improvement
                    </div>
                    <ul className="space-y-2">
                      {pyqPerf.weakTopics.slice(0, 4).map((t) => (
                        <li key={t.topicId} className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">{t.topicTitle}</span>
                          <Badge tone="danger">{t.accuracy.toFixed(0)}%</Badge>
                        </li>
                      ))}
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
