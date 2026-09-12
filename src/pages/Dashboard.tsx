import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Flame, Target, BookOpenCheck, Timer, ArrowUpRight, TrendingUp, CalendarClock, Sparkles, Trophy } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { SYLLABUS, getAllTopicsCount } from '../data/syllabus';
import { useGamification } from '../lib/gamification';
import { SUBJECT_COLORS, daysUntil, formatDate, formatMinutes, cx } from '../lib/utils';
import { Card, ProgressBar, Badge, Button, fadeUp, staggerContainer } from '../components/ui/Primitives';

export default function Dashboard() {
  const completedTopics = useAppStore((s) => s.completedTopics);
  const attempts = useAppStore((s) => s.attempts);
  const sessions = useAppStore((s) => s.sessions);
  const examDate = useAppStore((s) => s.examDate);
  const dailyGoalMinutes = useAppStore((s) => s.dailyGoalMinutes);
  const studyLog = useAppStore((s) => s.studyLog);
  const gami = useGamification();
  const streak = gami.streaks.current;
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayMinutes = studyLog[todayKey]?.focusMinutes ?? 0;

  const totalTopics = getAllTopicsCount();
  const doneTopics = Object.values(completedTopics).filter(Boolean).length;
  const overallPct = totalTopics ? Math.round((doneTopics / totalTopics) * 100) : 0;

  const days = daysUntil(examDate);

  const avgScore =
    attempts.length > 0
      ? Math.round((attempts.reduce((s, a) => s + (a.score / a.maxScore) * 100, 0) / attempts.length) * 10) / 10
      : null;

  const totalFocusMinutes = sessions.filter((s) => s.mode === 'focus').reduce((sum, s) => sum + s.durationMinutes, 0);

  const weakSubjects = SYLLABUS.map((subj) => {
    const done = subj.topics.filter((t) => completedTopics[t.id]).length;
    return { subj, pct: subj.topics.length ? done / subj.topics.length : 0 };
  })
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 4);

  const recentAttempts = attempts.slice(0, 3);

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
                Target exam date: <span className="font-semibold text-slate-700 dark:text-slate-200">{formatDate(examDate)}</span>. Stay consistent — small daily progress compounds.
              </p>
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

            <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:grid-cols-4 lg:w-72">
              <StatTile icon={Target} label="Syllabus" value={`${overallPct}%`} accent="text-brand-600 dark:text-brand-400" />
              <StatTile icon={Flame} label="Streak" value={`${streak}d`} accent="text-orange-500" />
              <StatTile icon={BookOpenCheck} label="Tests" value={`${attempts.length}`} accent="text-emerald-600 dark:text-emerald-400" />
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
            <Badge tone="gold">
              <Trophy className="h-3 w-3" /> Level {gami.level.level}
            </Badge>
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
          {gami.nextBadge && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5 text-xs text-slate-500 dark:text-slate-400">
              <Sparkles className="h-3.5 w-3.5 text-brand-500 shrink-0" />
              Next achievement: <span className="font-medium text-slate-700 dark:text-slate-200">{gami.nextBadge.title}</span> — {gami.nextBadge.description}
            </div>
          )}
        </Card>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Subject progress */}
        <motion.div {...fadeUp} className="lg:col-span-2">
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
        <motion.div {...fadeUp} className="space-y-6">
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
            <h3 className="mb-4 font-display font-semibold text-slate-800 dark:text-slate-100">Needs Attention</h3>
            <ul className="space-y-3">
              {weakSubjects.map(({ subj, pct }) => (
                <li key={subj.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-300">{subj.shortTitle}</span>
                  <Badge tone={pct < 0.3 ? 'danger' : 'neutral'}>{Math.round(pct * 100)}%</Badge>
                </li>
              ))}
            </ul>
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
