import { useMemo } from 'react';
import { motion } from 'framer-motion';
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
import { Award, Lock, Trophy } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { SYLLABUS, getAllTopicsCount } from '../data/syllabus';
import { BADGES, useGamification } from '../lib/gamification';
import { SUBJECT_COLORS, formatMinutes, cx } from '../lib/utils';
import { Card, Badge, PageHeader, fadeUp } from '../components/ui/Primitives';

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
  const studyLog = useAppStore((s) => s.studyLog);
  const gami = useGamification();

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
  const avgAccuracy =
    attempts.length > 0
      ? Math.round(
          (attempts.reduce((s, a) => s + (a.correctCount / Math.max(1, a.correctCount + a.wrongCount)) * 100, 0) / attempts.length) * 10,
        ) / 10
      : 0;

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
