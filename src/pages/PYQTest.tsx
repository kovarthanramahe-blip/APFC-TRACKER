import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  ListChecks,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Trophy,
  RotateCcw,
  ArrowLeft,
  BookOpen,
} from 'lucide-react';
import { PYQ_BANK } from '../data/pyq';
import { SYLLABUS } from '../data/syllabus';
import { SUBJECT_COLORS, cx } from '../lib/utils';
import { Card, Button, Badge, PageHeader, ProgressBar } from '../components/ui/Primitives';
import type { PYQ, SubjectColorKey } from '../lib/types';

const COUNT_OPTIONS = [10, 20, 30, 50] as const;
type CountChoice = (typeof COUNT_OPTIONS)[number] | 'all';

// APFC 2025 marking scheme: +2.5 for correct, -1/3rd (given as -0.833333) for wrong, 0 for unanswered.
const MARKS_CORRECT = 2.5;
const MARKS_WRONG = -0.833333;

// topicId -> topic title, built once from the existing syllabus (not modified).
const TOPIC_TITLES: Record<string, string> = Object.fromEntries(SYLLABUS.flatMap((s) => s.topics.map((t) => [t.id, t.title])));

type QuestionStatus = 'correct' | 'wrong' | 'unanswered';

function statusOf(q: PYQ, answers: Record<string, string | null>): QuestionStatus {
  const ans = answers[q.id];
  if (!ans) return 'unanswered';
  return ans === q.correctOptionId ? 'correct' : 'wrong';
}

const AVAILABLE_YEARS = Array.from(new Set(PYQ_BANK.map((p) => p.year))).sort((a, b) => a - b);
const SUBJECTS_IN_BANK: SubjectColorKey[] = SYLLABUS.map((s) => s.colorKey).filter((key) => PYQ_BANK.some((p) => p.subject === key));

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

type Phase = 'select' | 'testing' | 'results' | 'review';

export default function PYQTest() {
  const [phase, setPhase] = useState<Phase>('select');

  const [year, setYear] = useState<number>(AVAILABLE_YEARS[0]);
  const [subject, setSubject] = useState<SubjectColorKey | 'all'>('all');
  const [topicId, setTopicId] = useState<string | 'all'>('all');
  const [countChoice, setCountChoice] = useState<CountChoice>(10);

  const [questions, setQuestions] = useState<PYQ[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [reviewIndex, setReviewIndex] = useState(0);

  const filtered = useMemo(() => {
    return PYQ_BANK.filter((p) => {
      if (p.year !== year) return false;
      if (subject !== 'all' && p.subject !== subject) return false;
      if (topicId !== 'all' && p.topicId !== topicId) return false;
      return true;
    });
  }, [year, subject, topicId]);

  const topicsForSubject = useMemo(() => {
    const pool = subject === 'all' ? PYQ_BANK.filter((p) => p.year === year) : PYQ_BANK.filter((p) => p.year === year && p.subject === subject);
    const ids = Array.from(new Set(pool.map((p) => p.topicId)));
    return ids
      .map((id) => ({ id, title: TOPIC_TITLES[id] ?? id }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [subject, year]);

  // Reset topic whenever the subject (or year) changes, since the old topic may no longer apply.
  useEffect(() => {
    setTopicId('all');
  }, [subject, year]);

  const availableCountOptions = COUNT_OPTIONS.filter((n) => n <= filtered.length);

  // Keep the selected count choice valid as filters narrow the pool.
  useEffect(() => {
    if (countChoice !== 'all' && countChoice > filtered.length) {
      setCountChoice(availableCountOptions.length > 0 ? availableCountOptions[availableCountOptions.length - 1] : 'all');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length]);

  function startTest() {
    if (filtered.length === 0) return;
    const n = countChoice === 'all' ? filtered.length : Math.min(countChoice, filtered.length);
    const selected = shuffle(filtered).slice(0, n);
    setQuestions(selected);
    setAnswers({});
    setCurrent(0);
    setPhase('testing');
  }

  function handleSubmit() {
    setPhase('results');
  }

  function restart() {
    setQuestions([]);
    setAnswers({});
    setCurrent(0);
    setReviewIndex(0);
    setPhase('select');
  }

  const results = useMemo(() => {
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;
    for (const q of questions) {
      const s = statusOf(q, answers);
      if (s === 'correct') correct += 1;
      else if (s === 'wrong') wrong += 1;
      else unanswered += 1;
    }
    const attempted = correct + wrong;
    const total = questions.length;
    const score = correct * MARKS_CORRECT + wrong * MARKS_WRONG;
    const accuracy = attempted > 0 ? (correct / attempted) * 100 : 0;
    return { total, attempted, correct, wrong, unanswered, score, accuracy };
  }, [questions, answers]);

  if (phase === 'select') {
    return (
      <div>
        <PageHeader eyebrow="Previous Year Questions" title="PYQs" description="Practice with actual previous-year APFC questions, filtered by year, subject and topic." />

        <Card className="p-5 sm:p-6 space-y-6">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Year</p>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_YEARS.map((y) => (
                <SelectChip key={y} active={year === y} onClick={() => setYear(y)}>
                  {y}
                </SelectChip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Subject</p>
            <div className="flex flex-wrap gap-2">
              <SelectChip active={subject === 'all'} onClick={() => setSubject('all')}>
                All Subjects
              </SelectChip>
              {SUBJECTS_IN_BANK.map((key) => {
                const s = SYLLABUS.find((sub) => sub.colorKey === key);
                return (
                  <SelectChip key={key} active={subject === key} onClick={() => setSubject(key)}>
                    {s?.shortTitle ?? key}
                  </SelectChip>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Topic</p>
            <div className="flex flex-wrap gap-2">
              <SelectChip active={topicId === 'all'} onClick={() => setTopicId('all')}>
                All Topics
              </SelectChip>
              {topicsForSubject.map((t) => (
                <SelectChip key={t.id} active={topicId === t.id} onClick={() => setTopicId(t.id)}>
                  {t.title}
                </SelectChip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Number of Questions</p>
            <div className="flex flex-wrap gap-2">
              {availableCountOptions.map((n) => (
                <SelectChip key={n} active={countChoice === n} onClick={() => setCountChoice(n)}>
                  {n}
                </SelectChip>
              ))}
              <SelectChip active={countChoice === 'all'} onClick={() => setCountChoice('all')}>
                All available ({filtered.length})
              </SelectChip>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-5">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-200">{filtered.length}</span> matching question{filtered.length === 1 ? '' : 's'}
            </p>
            <Button onClick={startTest} disabled={filtered.length === 0}>
              Start Test
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (phase === 'results') {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader eyebrow="Previous Year Questions" title="Results" description="Here's how your PYQ practice session went." />

        <Card className="mb-5 p-5 sm:p-6 text-center">
          <Trophy className="mx-auto h-8 w-8 text-gold-500" />
          <p className="mt-2 text-xs text-slate-400">Score</p>
          <p className="font-display text-4xl font-bold text-slate-900 dark:text-white">
            {results.score.toFixed(2)} <span className="text-lg font-medium text-slate-400">/ {(results.total * MARKS_CORRECT).toFixed(2)}</span>
          </p>
          <p className="mt-1 text-xs text-slate-400">+{MARKS_CORRECT} per correct, {MARKS_WRONG} per wrong, 0 for unanswered</p>
        </Card>

        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Total Questions" value={`${results.total}`} />
          <StatTile label="Attempted" value={`${results.attempted}`} />
          <StatTile label="Unanswered" value={`${results.unanswered}`} />
          <StatTile label="Correct" value={`${results.correct}`} tone="success" />
          <StatTile label="Wrong" value={`${results.wrong}`} tone="danger" />
          <StatTile label="Accuracy" value={`${results.accuracy.toFixed(1)}%`} tone="brand" />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            className="flex-1"
            onClick={() => {
              setReviewIndex(0);
              setPhase('review');
            }}
          >
            Review Answers
          </Button>
          <Button variant="secondary" className="flex-1" onClick={restart}>
            <RotateCcw className="h-4 w-4" /> Start Another Test
          </Button>
        </div>
      </div>
    );
  }

  if (phase === 'review') {
    const q = questions[reviewIndex];
    const status = statusOf(q, answers);
    const userAnswerId = answers[q.id];
    const colors = SUBJECT_COLORS[q.subject];
    const subjectTitle = SYLLABUS.find((s) => s.colorKey === q.subject)?.title ?? q.subject;
    const topicTitle = TOPIC_TITLES[q.topicId] ?? q.topicId;

    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <button
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            onClick={() => setPhase('results')}
          >
            <ArrowLeft className="h-4 w-4" /> Back to Summary
          </button>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Question {reviewIndex + 1} of {questions.length}
          </p>
        </div>

        <Card className="p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge className={cx(colors.bg, colors.text)}>{topicTitle}</Badge>
            <StatusBadge status={status} />
          </div>
          <p className="whitespace-pre-line text-base font-medium text-slate-800 dark:text-slate-100">{q.question}</p>

          <div className="mt-5 space-y-2.5">
            {q.options.map((opt) => {
              const isCorrectOpt = opt.id === q.correctOptionId;
              const isUserChoice = opt.id === userAnswerId;
              return (
                <div
                  key={opt.id}
                  className={cx(
                    'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm',
                    isCorrectOpt
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-600/50 dark:bg-emerald-500/10 dark:text-emerald-300'
                      : isUserChoice
                      ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300',
                  )}
                >
                  <span>{opt.text}</span>
                  {isCorrectOpt && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
                  {isUserChoice && !isCorrectOpt && <XCircle className="h-4 w-4 shrink-0 text-rose-500" />}
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Explanation</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">{q.explanation}</p>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <p className="text-xs text-slate-400">
              <span className="font-medium text-slate-500 dark:text-slate-400">{subjectTitle}</span> · {topicTitle}
            </p>
            <Link to={`/syllabus?topicId=${encodeURIComponent(q.topicId)}`}>
              <Button variant="secondary" size="sm">
                <BookOpen className="h-3.5 w-3.5" /> Study this topic
              </Button>
            </Link>
          </div>
        </Card>

        <div className="mt-4 flex items-center justify-between gap-3">
          <Button variant="secondary" disabled={reviewIndex === 0} onClick={() => setReviewIndex((i) => i - 1)}>
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          <Button variant="secondary" disabled={reviewIndex === questions.length - 1} onClick={() => setReviewIndex((i) => Math.min(questions.length - 1, i + 1))}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Card className="mt-4 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Jump to Question</p>
          <div className="grid grid-cols-8 gap-2 sm:grid-cols-10">
            {questions.map((qq, i) => {
              const st = statusOf(qq, answers);
              const isCurrent = i === reviewIndex;
              return (
                <button
                  key={qq.id}
                  onClick={() => setReviewIndex(i)}
                  className={cx(
                    'h-8 w-8 rounded-lg text-xs font-semibold transition-colors',
                    isCurrent
                      ? 'bg-brand-600 text-white'
                      : st === 'correct'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : st === 'wrong'
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                  )}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
            <span><span className="inline-block h-2 w-2 rounded-full bg-emerald-400 mr-1.5" />Correct</span>
            <span><span className="inline-block h-2 w-2 rounded-full bg-rose-400 mr-1.5" />Wrong</span>
            <span><span className="inline-block h-2 w-2 rounded-full bg-slate-300 mr-1.5" />Unanswered</span>
          </div>
        </Card>
      </div>
    );
  }

  // phase === 'testing'
  const q = questions[current];
  const colors = SUBJECT_COLORS[q.subject];
  const answeredCount = Object.values(answers).filter(Boolean).length;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Question {current + 1} of {questions.length}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <ListChecks className="h-3.5 w-3.5" /> {answeredCount} answered
        </div>
      </div>

      <div className="mb-4">
        <ProgressBar value={current + 1} max={questions.length} />
      </div>

      <Card className="p-5 sm:p-6">
        <div className="mb-3">
          <Badge className={cx(colors.bg, colors.text)}>{TOPIC_TITLES[q.topicId] ?? q.subject}</Badge>
        </div>
        <motion.p
          key={q.id}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="whitespace-pre-line text-base font-medium text-slate-800 dark:text-slate-100"
        >
          {q.question}
        </motion.p>

        <div className="mt-5 space-y-2.5">
          {q.options.map((opt) => {
            const selected = answers[q.id] === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt.id }))}
                className={cx(
                  'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                  selected
                    ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-200'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-brand-300',
                )}
              >
                <span
                  className={cx(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold',
                    selected ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 dark:border-slate-600 text-transparent',
                  )}
                >
                  ●
                </span>
                {opt.text}
              </button>
            );
          })}
        </div>
        {answers[q.id] && (
          <button className="mt-3 text-xs text-slate-400 hover:underline" onClick={() => setAnswers((a) => ({ ...a, [q.id]: null }))}>
            Clear response
          </button>
        )}
      </Card>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Button variant="secondary" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>
        {current === questions.length - 1 ? (
          <Button onClick={() => confirm('Submit the test now?') && handleSubmit()}>Submit Test</Button>
        ) : (
          <Button onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
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

function StatusBadge({ status }: { status: QuestionStatus }) {
  if (status === 'correct') {
    return (
      <Badge tone="success">
        <CheckCircle2 className="h-3 w-3" /> Correct
      </Badge>
    );
  }
  if (status === 'wrong') {
    return (
      <Badge tone="danger">
        <XCircle className="h-3 w-3" /> Wrong
      </Badge>
    );
  }
  return (
    <Badge tone="neutral">
      <MinusCircle className="h-3 w-3" /> Unanswered
    </Badge>
  );
}

function SelectChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
        active
          ? 'bg-brand-600 text-white border-brand-600'
          : 'bg-transparent text-slate-500 border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:text-slate-400',
      )}
    >
      {children}
    </button>
  );
}
