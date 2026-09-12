import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { CheckCircle2, XCircle, MinusCircle, Trophy, RotateCcw } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { QUESTION_BANK } from '../data/questionBank';
import { SUBJECT_META } from '../data/syllabus';
import { SUBJECT_COLORS, cx } from '../lib/utils';
import { Card, Badge, Button, PageHeader, fadeUp } from '../components/ui/Primitives';

export default function MockTestResult() {
  const { attemptId } = useParams();
  const attempt = useAppStore((s) => s.attempts.find((a) => a.id === attemptId));

  if (!attempt) {
    return (
      <div className="py-20 text-center">
        <p className="text-slate-500">Result not found.</p>
        <Link to="/mock-tests" className="text-brand-600 hover:underline text-sm">
          Back to Mock Tests
        </Link>
      </div>
    );
  }

  const accuracy = attempt.correctCount + attempt.wrongCount > 0 ? Math.round((attempt.correctCount / (attempt.correctCount + attempt.wrongCount)) * 100) : 0;
  const percentile = Math.round((attempt.score / attempt.maxScore) * 100);

  const chartData = Object.entries(attempt.subjectBreakdown).map(([key, v]) => ({
    name: SUBJECT_META[key]?.short ?? key,
    Correct: v.correct,
    Wrong: v.wrong,
    Skipped: v.skipped,
  }));

  const questions = attempt.questionIds.map((id) => QUESTION_BANK.find((q) => q.id === id)!).filter(Boolean);

  return (
    <div>
      <PageHeader
        eyebrow="Result"
        title={attempt.blueprintTitle}
        description={new Date(attempt.submittedAt).toLocaleString('en-IN')}
        action={
          <Link to="/mock-tests">
            <Button variant="secondary">
              <RotateCcw className="h-4 w-4" /> Take another test
            </Button>
          </Link>
        }
      />

      <motion.div {...fadeUp} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <ScoreCard icon={Trophy} label="Score" value={`${attempt.score.toFixed(2)} / ${attempt.maxScore}`} tone="gold" />
        <ScoreCard icon={CheckCircle2} label="Correct" value={`${attempt.correctCount}`} tone="success" />
        <ScoreCard icon={XCircle} label="Wrong" value={`${attempt.wrongCount}`} tone="danger" />
        <ScoreCard icon={MinusCircle} label="Skipped" value={`${attempt.skippedCount}`} tone="neutral" />
      </motion.div>

      <motion.div {...fadeUp} className="grid gap-4 sm:grid-cols-2 mb-6">
        <Card className="p-5">
          <p className="text-xs text-slate-400 mb-1">Overall Percentage</p>
          <p className="font-display text-3xl font-bold text-slate-900 dark:text-white">{percentile}%</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-slate-400 mb-1">Accuracy (of attempted)</p>
          <p className="font-display text-3xl font-bold text-slate-900 dark:text-white">{accuracy}%</p>
        </Card>
      </motion.div>

      {chartData.length > 1 && (
        <motion.div {...fadeUp}>
          <Card className="p-5 sm:p-6 mb-6">
            <h3 className="mb-4 font-display font-semibold text-slate-800 dark:text-slate-100">Subject-wise Breakdown</h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={60} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Bar dataKey="Correct" stackId="a" fill="#059669" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Wrong" stackId="a" fill="#e11d48" />
                  <Bar dataKey="Skipped" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </motion.div>
      )}

      <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100 mb-4">Answer Review</h3>
      <div className="space-y-3">
        {questions.map((q, idx) => {
          const userAnswer = attempt.answers[q.id];
          const isCorrect = userAnswer === q.correctOptionId;
          const colors = SUBJECT_COLORS[q.subject];
          return (
            <Card key={q.id} className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0">
                  {!userAnswer ? (
                    <MinusCircle className="h-5 w-5 text-slate-300" />
                  ) : isCorrect ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-rose-500" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-xs text-slate-300 dark:text-slate-600 font-semibold">{idx + 1}.</span>
                    <Badge className={cx(colors.bg, colors.text)}>{q.topic}</Badge>
                  </div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{q.question}</p>
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {q.options.map((opt) => {
                      const isChosen = userAnswer === opt.id;
                      const isRight = opt.id === q.correctOptionId;
                      return (
                        <div
                          key={opt.id}
                          className={cx(
                            'rounded-lg border px-3 py-1.5 text-xs',
                            isRight
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-600/50 dark:bg-emerald-500/10 dark:text-emerald-300'
                              : isChosen
                              ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300'
                              : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400',
                          )}
                        >
                          {opt.text}
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Why: </span>
                    {q.explanation}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ScoreCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  tone: 'gold' | 'success' | 'danger' | 'neutral';
}) {
  const tones: Record<string, string> = {
    gold: 'text-gold-600 dark:text-gold-400',
    success: 'text-emerald-600 dark:text-emerald-400',
    danger: 'text-rose-600 dark:text-rose-400',
    neutral: 'text-slate-500 dark:text-slate-400',
  };
  return (
    <Card className="p-4">
      <Icon className={cx('h-5 w-5 mb-2', tones[tone])} />
      <p className="font-display text-xl font-bold text-slate-900 dark:text-white">{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    </Card>
  );
}
