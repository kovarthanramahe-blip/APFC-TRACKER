import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
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
  History,
  Star,
  BarChart3,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Brain,
} from 'lucide-react';
import { PYQ_BANK } from '../data/pyq';
import { SYLLABUS } from '../data/syllabus';
import { useAppStore } from '../lib/store';
import { SUBJECT_COLORS, getLocalDateString, cx, uuid } from '../lib/utils';
import { Card, Button, Badge, PageHeader, ProgressBar } from '../components/ui/Primitives';
import { FormattedText } from '../components/ui/FormattedText';
import type { PYQ, PYQAttempt, SubjectColorKey } from '../lib/types';
import {
  getAvailableYears,
  getYearCounts,
  formatYearLabel,
  getSubjectCounts,
  getTopicCounts,
  computeRevisionStatusMap,
  computeEligibleRevisionIds,
  filterPYQs,
  getVerificationNotice,
  type RevisionFilter,
} from '../lib/pyqFilters';
import {
  computePyqPerformance,
  pyqQuestionStatus as statusOf,
  TOPIC_TITLES,
  MARKS_CORRECT,
  MARKS_WRONG,
  type PyqQuestionStatus as QuestionStatus,
} from '../lib/pyqPerformance';
import { getDueItems } from '../lib/revisionQueue';
import { computeUnifiedTopicStatus } from '../lib/topicStatus';
import { selectWeakTopicPracticeIds } from '../lib/weakTopicPractice';

const COUNT_OPTIONS = [10, 20, 30, 50] as const;
type CountChoice = (typeof COUNT_OPTIONS)[number] | 'all';

// Every one of these is derived from PYQ_BANK via the pure helpers in lib/pyqFilters — no year,
// subject or topic (or their counts) is ever hardcoded, so a future data import shows up automatically.
const AVAILABLE_YEARS = getAvailableYears(PYQ_BANK);
const YEAR_COUNTS = getYearCounts(PYQ_BANK);

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

type Phase = 'select' | 'testing' | 'results' | 'review' | 'bookmarks' | 'analytics' | 'revise';

function BookmarkButton({ pyqId }: { pyqId: string }) {
  const isBookmarked = useAppStore((s) => s.bookmarkedPyqIds.includes(pyqId));
  const toggleBookmarkedPyq = useAppStore((s) => s.toggleBookmarkedPyq);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        toggleBookmarkedPyq(pyqId);
      }}
      title={isBookmarked ? 'Remove bookmark' : 'Bookmark this question'}
      className={cx('shrink-0 rounded-lg p-1.5 transition-colors', isBookmarked ? 'text-gold-500' : 'text-slate-300 hover:text-gold-500 dark:text-slate-600')}
    >
      <Star className={cx('h-4.5 w-4.5', isBookmarked && 'fill-gold-400')} />
    </button>
  );
}

export default function PYQTest() {
  const pyqAttempts = useAppStore((s) => s.pyqAttempts);
  const addPyqAttempt = useAppStore((s) => s.addPyqAttempt);
  const bookmarkedPyqIds = useAppStore((s) => s.bookmarkedPyqIds);
  const revisionQueue = useAppStore((s) => s.revisionQueue);
  const recordRevisionCorrect = useAppStore((s) => s.recordRevisionCorrect);
  const recordRevisionIncorrect = useAppStore((s) => s.recordRevisionIncorrect);
  const completedTopics = useAppStore((s) => s.completedTopics);

  const [phase, setPhase] = useState<Phase>('select');

  // Deep-link support: Dashboard/Analytics/Exam Readiness link here as /pyq-test?mode=weak_topics
  // to open the existing Practice Weak Topics session directly (see the effect below, right after
  // weakTopicQuestions/practiceWeakTopics are defined) — reuses practiceWeakTopics() as-is, no
  // second entry path.
  const [searchParams] = useSearchParams();
  const autoStartWeakTopicsRef = useRef(false);

  const [year, setYear] = useState<number | 'all'>(AVAILABLE_YEARS[0]);
  const [subject, setSubject] = useState<SubjectColorKey | 'all'>('all');
  const [topicId, setTopicId] = useState<string | 'all'>('all');
  const [revisionFilter, setRevisionFilter] = useState<RevisionFilter>('all');
  const [countChoice, setCountChoice] = useState<CountChoice>(10);

  const [questions, setQuestions] = useState<PYQ[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [reviewIndex, setReviewIndex] = useState(0);
  // Guards against saving more than one attempt record per submitted test,
  // even if the results screen is somehow re-entered/re-rendered.
  const submittedRef = useRef(false);
  // Weak-Topic Practice (Stage 2) — purely a display flag so the shared testing/results screens
  // can show "Weak Topics Practice"; it never changes what those screens do, only what they show.
  const [isWeakTopicSession, setIsWeakTopicSession] = useState(false);

  // Per-question revision status, derived entirely from the existing PYQAttempt[] — no new
  // persisted data. See computeRevisionStatusMap in lib/pyqFilters for the exact rule (most
  // recent attempt touching a question wins; a skipped/unanswered question stays 'unattempted').
  const questionRevisionStatus = useMemo(() => computeRevisionStatusMap(PYQ_BANK, pyqAttempts), [pyqAttempts]);

  const filtered = useMemo(
    () => filterPYQs(PYQ_BANK, { year, subject, topicId, revisionFilter, revisionStatusMap: questionRevisionStatus }),
    [year, subject, topicId, revisionFilter, questionRevisionStatus],
  );

  // Subject counts scoped to the active year only (per spec: not narrowed by subject/topic/revision) —
  // and, since getSubjectCounts only keys subjects actually present in that year's pool, the subject
  // chip row itself is dynamic: a subject absent from a given year's paper simply doesn't render.
  const subjectCounts = useMemo(() => getSubjectCounts(PYQ_BANK, year), [year]);
  const subjectsForYear = useMemo(
    () => (Object.keys(subjectCounts) as SubjectColorKey[]).sort((a, b) => {
      const aTitle = SYLLABUS.find((s) => s.colorKey === a)?.shortTitle ?? a;
      const bTitle = SYLLABUS.find((s) => s.colorKey === b)?.shortTitle ?? b;
      return aTitle.localeCompare(bTitle);
    }),
    [subjectCounts],
  );
  const yearPoolCount = year === 'all' ? PYQ_BANK.length : (YEAR_COUNTS[year] ?? 0);

  // Topic counts scoped to the active year + subject (per spec) — same "only what's present" dynamism.
  const topicCounts = useMemo(() => getTopicCounts(PYQ_BANK, year, subject), [year, subject]);
  const topicsForSubject = useMemo(
    () =>
      topicCounts
        .map(({ id, count }) => ({ id, count, title: TOPIC_TITLES[id] ?? id }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [topicCounts],
  );
  const subjectPoolCount = topicCounts.reduce((sum, t) => sum + t.count, 0);

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
    submittedRef.current = false;
    setIsWeakTopicSession(false);
    setQuestions(selected);
    setAnswers({});
    setCurrent(0);
    setPhase('testing');
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

  function handleSubmit() {
    if (!submittedRef.current) {
      submittedRef.current = true;
      const attempt: PYQAttempt = {
        id: uuid(),
        submittedAt: new Date().toISOString(),
        year,
        subject,
        topicId,
        questionIds: questions.map((q) => q.id),
        answers,
        correctCount: results.correct,
        wrongCount: results.wrong,
        unansweredCount: results.unanswered,
        score: results.score,
        accuracy: results.accuracy,
      };
      addPyqAttempt(attempt);
    }
    setPhase('results');
  }

  function restart() {
    setQuestions([]);
    setAnswers({});
    setCurrent(0);
    setReviewIndex(0);
    setIsWeakTopicSession(false);
    setPhase('select');
  }

  // Reopen a saved attempt: rebuild its question list from the live PYQ_BANK (never
  // duplicated into the attempt record) and drop straight into the existing
  // Results/Review UI — no second review implementation, and nothing is re-saved.
  function openAttempt(attempt: PYQAttempt) {
    const qs = attempt.questionIds.map((id) => PYQ_BANK.find((p) => p.id === id)).filter((q): q is PYQ => !!q);
    submittedRef.current = true;
    setIsWeakTopicSession(false);
    setQuestions(qs);
    setAnswers(attempt.answers);
    setCurrent(0);
    setReviewIndex(0);
    setPhase('results');
  }

  function retryWrong() {
    const wrongQs = questions.filter((q) => statusOf(q, answers) === 'wrong');
    if (wrongQs.length === 0) return;
    submittedRef.current = false;
    setQuestions(wrongQs);
    setAnswers({});
    setCurrent(0);
    setPhase('testing');
  }

  const bookmarkedQuestions = useMemo(
    () => bookmarkedPyqIds.map((id) => PYQ_BANK.find((p) => p.id === id)).filter((q): q is PYQ => !!q),
    [bookmarkedPyqIds],
  );

  // Opens a bookmarked question for revision (correct answer + explanation visible
  // immediately, like reviewing a completed test) — reuses the review UI as-is,
  // with no user answers since this isn't a live attempt.
  function openBookmarks(startAt = 0) {
    if (bookmarkedQuestions.length === 0) return;
    submittedRef.current = true;
    setQuestions(bookmarkedQuestions);
    setAnswers({});
    setReviewIndex(Math.min(startAt, bookmarkedQuestions.length - 1));
    setPhase('review');
  }

  function practiceBookmarked() {
    if (bookmarkedQuestions.length === 0) return;
    submittedRef.current = false;
    setIsWeakTopicSession(false);
    setQuestions(bookmarkedQuestions);
    setAnswers({});
    setCurrent(0);
    setPhase('testing');
  }

  // Performance analytics — delegates to the shared lib/pyqPerformance helper so this view and
  // the Analytics page's "PYQ Performance" section always agree (see computePyqPerformance).
  const performance = useMemo(() => computePyqPerformance(PYQ_BANK, pyqAttempts), [pyqAttempts]);

  // Weak-Topic Practice (Stage 2) — reuses the exact same unified topic-status engine
  // (lib/topicStatus) Dashboard/Analytics/Exam Readiness already use, and the pure
  // selectWeakTopicPracticeIds selector (lib/weakTopicPractice, Stage 1) verbatim — no second
  // topic-strength or selection calculation happens here.
  const topicStatuses = useMemo(() => computeUnifiedTopicStatus(SYLLABUS, completedTopics, performance), [completedTopics, performance]);
  const weakTopicPracticeIds = useMemo(() => selectWeakTopicPracticeIds(topicStatuses, PYQ_BANK), [topicStatuses]);
  const weakTopicQuestions = useMemo(
    () => weakTopicPracticeIds.map((id) => PYQ_BANK.find((p) => p.id === id)).filter((q): q is PYQ => !!q),
    [weakTopicPracticeIds],
  );

  // Frozen snapshot at click time — the selector isn't re-run as answers come in, same
  // "freeze at session start" convention Revise Now already established for its own due list.
  // Reuses the exact same testing/results/review engine as every other entry point below (normal
  // tests, Retry Wrong, Practice Bookmarked) — no second question/session engine, and the resulting
  // PYQAttempt is saved through the same handleSubmit path with unchanged attempt semantics.
  function practiceWeakTopics() {
    if (weakTopicQuestions.length === 0) return;
    submittedRef.current = false;
    setIsWeakTopicSession(true);
    setQuestions(weakTopicQuestions);
    setAnswers({});
    setCurrent(0);
    setPhase('testing');
  }

  // Weak-Topic Practice (Stage 3) — /pyq-test?mode=weak_topics auto-starts the same session as the
  // "Practice Weak Topics" button, once per page load. If there's nothing eligible yet, this simply
  // does nothing and the user lands on the select screen, where the button itself is disabled —
  // the same "no eligible questions" empty state as clicking it manually.
  useEffect(() => {
    if (autoStartWeakTopicsRef.current) return;
    if (searchParams.get('mode') !== 'weak_topics') return;
    autoStartWeakTopicsRef.current = true;
    if (weakTopicQuestions.length > 0) practiceWeakTopics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, weakTopicQuestions]);

  // Revision queue (Stage 2) — eligibility (incorrect OR bookmarked) is derived live here, never
  // stored: as soon as a question becomes incorrect or gets bookmarked it's automatically
  // eligible, and nothing needs to be added/removed from anywhere when that changes. Only
  // scheduling state (lib/revisionQueue) is persisted, keyed by pyqId — never all 458 questions.
  const eligibleRevisionIds = useMemo(
    () => computeEligibleRevisionIds(PYQ_BANK, questionRevisionStatus, bookmarkedPyqIds),
    [questionRevisionStatus, bookmarkedPyqIds],
  );
  const dueRevisionItems = useMemo(
    () => getDueItems(revisionQueue, eligibleRevisionIds, getLocalDateString()),
    [revisionQueue, eligibleRevisionIds],
  );

  const [reviseQuestions, setReviseQuestions] = useState<PYQ[]>([]);
  const [reviseIndex, setReviseIndex] = useState(0);
  const [reviseAnswer, setReviseAnswer] = useState<string | null>(null);
  const [reviseChecked, setReviseChecked] = useState(false);
  const [reviseCorrectCount, setReviseCorrectCount] = useState(0);
  const [reviseComplete, setReviseComplete] = useState(false);
  // Guards against recording the same question's answer twice (e.g. a double click) — recording
  // twice would incorrectly advance/reset its box an extra time within one session.
  const reviseRecordedRef = useRef<Set<string>>(new Set());

  // The due list is frozen at session start (a plain snapshot, not re-derived from live state as
  // answers come in) — so a question rescheduled by THIS session's own recordCorrect/Incorrect
  // call can never reappear later in the SAME session.
  function startRevision() {
    if (dueRevisionItems.length === 0) return;
    const qs = dueRevisionItems.map((item) => PYQ_BANK.find((p) => p.id === item.pyqId)).filter((q): q is PYQ => !!q);
    reviseRecordedRef.current = new Set();
    setReviseQuestions(qs);
    setReviseIndex(0);
    setReviseAnswer(null);
    setReviseChecked(false);
    setReviseCorrectCount(0);
    setReviseComplete(false);
    setPhase('revise');
  }

  function checkRevisionAnswer() {
    const q = reviseQuestions[reviseIndex];
    if (!q || reviseChecked || reviseRecordedRef.current.has(q.id)) return;
    reviseRecordedRef.current.add(q.id);
    const today = getLocalDateString();
    if (reviseAnswer === q.correctOptionId) {
      recordRevisionCorrect(q.id, today);
      setReviseCorrectCount((c) => c + 1);
    } else {
      recordRevisionIncorrect(q.id, today);
    }
    setReviseChecked(true);
  }

  function nextRevisionQuestion() {
    if (reviseIndex >= reviseQuestions.length - 1) {
      setReviseComplete(true);
      return;
    }
    setReviseIndex((i) => i + 1);
    setReviseAnswer(null);
    setReviseChecked(false);
  }

  if (phase === 'select') {
    return (
      <div>
        <PageHeader
          eyebrow="Previous Year Questions"
          title="PYQs"
          description="Practice with actual previous-year APFC questions, filtered by year, subject and topic."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => setPhase('analytics')}>
                <BarChart3 className="h-4 w-4" /> Performance
              </Button>
              <Button variant="secondary" onClick={() => setPhase('bookmarks')}>
                <Star className={cx('h-4 w-4', bookmarkedQuestions.length > 0 && 'fill-gold-400 text-gold-500')} />
                Bookmarked PYQs{bookmarkedQuestions.length > 0 ? ` (${bookmarkedQuestions.length})` : ''}
              </Button>
              <Button variant="secondary" onClick={practiceWeakTopics} disabled={weakTopicQuestions.length === 0}>
                <TrendingDown className="h-4 w-4" /> Practice Weak Topics{weakTopicQuestions.length > 0 ? ` (${weakTopicQuestions.length})` : ''}
              </Button>
              <Button onClick={startRevision} disabled={dueRevisionItems.length === 0}>
                <Brain className="h-4 w-4" /> Revise Now{dueRevisionItems.length > 0 ? ` (${dueRevisionItems.length})` : ''}
              </Button>
            </div>
          }
        />

        <Card className="p-5 sm:p-6 space-y-6">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Year</p>
            <div className="flex flex-wrap gap-2">
              <SelectChip active={year === 'all'} onClick={() => setYear('all')}>
                All Years ({PYQ_BANK.length})
              </SelectChip>
              {AVAILABLE_YEARS.map((y) => (
                <SelectChip key={y} active={year === y} onClick={() => setYear(y)}>
                  {y} ({YEAR_COUNTS[y]})
                </SelectChip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Subject</p>
            <div className="flex flex-wrap gap-2">
              <SelectChip active={subject === 'all'} onClick={() => setSubject('all')}>
                All Subjects ({yearPoolCount})
              </SelectChip>
              {subjectsForYear.map((key) => {
                const s = SYLLABUS.find((sub) => sub.colorKey === key);
                return (
                  <SelectChip key={key} active={subject === key} onClick={() => setSubject(key)}>
                    {s?.shortTitle ?? key} ({subjectCounts[key] ?? 0})
                  </SelectChip>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Topic</p>
            <div className="flex flex-wrap gap-2">
              <SelectChip active={topicId === 'all'} onClick={() => setTopicId('all')}>
                All Topics ({subjectPoolCount})
              </SelectChip>
              {topicsForSubject.map((t) => (
                <SelectChip key={t.id} active={topicId === t.id} onClick={() => setTopicId(t.id)}>
                  {t.title} ({t.count})
                </SelectChip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Revision</p>
            <div className="flex flex-wrap gap-2">
              <SelectChip active={revisionFilter === 'all'} onClick={() => setRevisionFilter('all')}>
                All Questions
              </SelectChip>
              <SelectChip active={revisionFilter === 'unattempted'} onClick={() => setRevisionFilter('unattempted')}>
                Unattempted
              </SelectChip>
              <SelectChip active={revisionFilter === 'incorrect'} onClick={() => setRevisionFilter('incorrect')}>
                Incorrect
              </SelectChip>
              <SelectChip active={revisionFilter === 'correct'} onClick={() => setRevisionFilter('correct')}>
                Correct
              </SelectChip>
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

        {pyqAttempts.length > 0 && (
          <Card className="mt-6 p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <History className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Attempt History</h3>
            </div>
            <div className="space-y-2">
              {pyqAttempts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => openAttempt(a)}
                  className="flex w-full flex-col gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 text-left transition-colors hover:border-brand-300 dark:hover:border-brand-500/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {new Date(a.submittedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatYearLabel(a.year)} · {a.questionIds.length} question{a.questionIds.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="font-display text-sm font-bold text-slate-700 dark:text-slate-200">{a.score.toFixed(2)} pts</span>
                    <span className="text-slate-400">{a.accuracy.toFixed(1)}% accuracy</span>
                    <span className="text-emerald-600 dark:text-emerald-400">{a.correctCount} correct</span>
                    <span className="text-rose-600 dark:text-rose-400">{a.wrongCount} wrong</span>
                    <span className="text-slate-400">{a.unansweredCount} unanswered</span>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    );
  }

  if (phase === 'bookmarks') {
    return (
      <div className="mx-auto max-w-2xl">
        <button
          className="mb-4 flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          onClick={() => setPhase('select')}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <PageHeader
          eyebrow="Previous Year Questions"
          title="Bookmarked PYQs"
          description={
            bookmarkedQuestions.length > 0
              ? `${bookmarkedQuestions.length} question${bookmarkedQuestions.length === 1 ? '' : 's'} saved for revision.`
              : 'Questions you bookmark while practicing will show up here.'
          }
          action={
            bookmarkedQuestions.length > 0 ? (
              <Button onClick={practiceBookmarked}>Practice Bookmarked</Button>
            ) : undefined
          }
        />

        {bookmarkedQuestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Star className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
            <p className="text-slate-400 text-sm">No bookmarked PYQs yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookmarkedQuestions.map((q, idx) => {
              const colors = SUBJECT_COLORS[q.subject];
              const subjectTitle = SYLLABUS.find((s) => s.colorKey === q.subject)?.shortTitle ?? q.subject;
              return (
                <Card key={q.id} className="p-4 cursor-pointer" onClick={() => openBookmarks(idx)}>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-xs font-semibold text-slate-300 dark:text-slate-600 w-6 shrink-0">{idx + 1}.</span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">{q.year}</Badge>
                        <Badge className={cx(colors.bg, colors.text)}>{subjectTitle}</Badge>
                        <Badge tone="neutral">{TOPIC_TITLES[q.topicId] ?? q.topicId}</Badge>
                      </div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-2">{q.question}</p>
                    </div>
                    <BookmarkButton pyqId={q.id} />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (phase === 'revise') {
    if (reviseComplete) {
      return (
        <div className="mx-auto max-w-2xl">
          <Card className="p-5 sm:p-6 text-center">
            <Brain className="mx-auto h-8 w-8 text-brand-500" />
            <p className="mt-2 text-xs text-slate-400">Revision session complete</p>
            <p className="font-display text-3xl font-bold text-slate-900 dark:text-white">
              {reviseCorrectCount} <span className="text-lg font-medium text-slate-400">/ {reviseQuestions.length} correct</span>
            </p>
            <Button className="mt-5" onClick={() => setPhase('select')}>
              Done
            </Button>
          </Card>
        </div>
      );
    }

    if (reviseQuestions.length === 0) {
      return (
        <div className="mx-auto max-w-2xl">
          <button
            className="mb-4 flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            onClick={() => setPhase('select')}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Brain className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
            <p className="text-slate-400 text-sm">Nothing due for revision right now.</p>
          </div>
        </div>
      );
    }

    const q = reviseQuestions[reviseIndex];
    const colors = SUBJECT_COLORS[q.subject];
    const isLastRevision = reviseIndex === reviseQuestions.length - 1;

    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Revision {reviseIndex + 1} of {reviseQuestions.length}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Brain className="h-3.5 w-3.5" /> {reviseCorrectCount} correct so far
          </div>
        </div>

        <div className="mb-4">
          <ProgressBar value={reviseIndex + 1} max={reviseQuestions.length} />
        </div>

        <Card className="p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Badge className={cx(colors.bg, colors.text)}>{TOPIC_TITLES[q.topicId] ?? q.subject}</Badge>
            <BookmarkButton pyqId={q.id} />
          </div>
          <FormattedText text={q.question} className="text-base font-medium text-slate-800 dark:text-slate-100" />

          <div className="mt-5 space-y-2.5">
            {q.options.map((opt) => {
              const isCorrectOpt = opt.id === q.correctOptionId;
              const isUserChoice = opt.id === reviseAnswer;
              const selected = reviseAnswer === opt.id;
              return (
                <button
                  key={opt.id}
                  disabled={reviseChecked}
                  onClick={() => setReviseAnswer(opt.id)}
                  className={cx(
                    'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                    reviseChecked
                      ? isCorrectOpt
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-600/50 dark:bg-emerald-500/10 dark:text-emerald-300'
                        : isUserChoice
                        ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                      : selected
                      ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-200'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-brand-300',
                  )}
                >
                  <FormattedText text={opt.text} className="min-w-0 flex-1" />
                  {reviseChecked && isCorrectOpt && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
                  {reviseChecked && isUserChoice && !isCorrectOpt && <XCircle className="h-4 w-4 shrink-0 text-rose-500" />}
                </button>
              );
            })}
          </div>

          {reviseChecked && (
            <>
              <VerificationBanner question={q} />
              <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Explanation</p>
                <FormattedText text={q.explanation} className="text-sm text-slate-600 dark:text-slate-300" />
              </div>
            </>
          )}
        </Card>

        <div className="mt-4 flex justify-end">
          {!reviseChecked ? (
            <Button onClick={checkRevisionAnswer} disabled={!reviseAnswer}>
              Check Answer
            </Button>
          ) : (
            <Button onClick={nextRevisionQuestion}>{isLastRevision ? 'Finish' : 'Next'}</Button>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'analytics') {
    return (
      <div className="mx-auto max-w-3xl">
        <button
          className="mb-4 flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          onClick={() => setPhase('select')}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <PageHeader
          eyebrow="Previous Year Questions"
          title="Performance"
          description="How you're doing across all your PYQ practice tests so far."
        />

        {!performance ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BarChart3 className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
            <p className="text-slate-400 text-sm">Take a PYQ test to see your performance analytics here.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <Card className="p-5 sm:p-6">
              <h3 className="mb-4 font-display font-semibold text-slate-800 dark:text-slate-100">Overall Performance</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Tests Completed" value={`${performance.overall.testsCompleted}`} />
                <StatTile label="Total Questions" value={`${performance.overall.totalQuestions}`} />
                <StatTile label="Attempted" value={`${performance.overall.totalAttempted}`} />
                <StatTile label="Unanswered" value={`${performance.overall.totalUnanswered}`} />
                <StatTile label="Correct" value={`${performance.overall.totalCorrect}`} tone="success" />
                <StatTile label="Wrong" value={`${performance.overall.totalWrong}`} tone="danger" />
                <StatTile label="Overall Accuracy" value={`${performance.overall.overallAccuracy.toFixed(1)}%`} tone="brand" />
                <StatTile label="Average Score" value={performance.overall.averageScore.toFixed(2)} tone="brand" />
              </div>
            </Card>

            <Card className="p-5 sm:p-6">
              <h3 className="mb-4 font-display font-semibold text-slate-800 dark:text-slate-100">Performance by Year</h3>
              <div className="space-y-2">
                {performance.years.map((y) => (
                  <div
                    key={y.year}
                    className="flex flex-col gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral">{y.year}</Badge>
                      <span className="text-xs text-slate-400">
                        {y.testCount} test{y.testCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <span className="text-slate-500 dark:text-slate-400">{y.attempted} attempted</span>
                      <span className="text-emerald-600 dark:text-emerald-400">{y.correct} correct</span>
                      <span className="text-rose-600 dark:text-rose-400">{y.wrong} wrong</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{y.attempted > 0 ? `${y.accuracy.toFixed(1)}%` : '—'}</span>
                      <span className="font-display font-bold text-brand-600 dark:text-brand-400">{y.score.toFixed(2)} pts</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5 sm:p-6">
              <h3 className="mb-4 font-display font-semibold text-slate-800 dark:text-slate-100">Subject Performance</h3>
              <div className="space-y-2">
                {performance.subjects.map((s) => {
                  const colors = SUBJECT_COLORS[s.subject];
                  return (
                    <div
                      key={s.subject}
                      className="flex flex-col gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <Badge className={cx(colors.bg, colors.text)}>{s.subjectTitle}</Badge>
                        <span className="text-xs text-slate-400">
                          {s.testCount} test{s.testCount === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-slate-500 dark:text-slate-400">{s.attempted} attempted</span>
                        <span className="text-emerald-600 dark:text-emerald-400">{s.correct} correct</span>
                        <span className="text-rose-600 dark:text-rose-400">{s.wrong} wrong</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {s.attempted > 0 ? `${s.accuracy.toFixed(1)}%` : '—'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {performance.weakTopics.length > 0 && (
              <Card className="p-5 sm:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-rose-500" />
                  <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Topics to Improve</h3>
                </div>
                <div className="space-y-2">
                  {performance.weakTopics.map((t) => (
                    <TopicRow key={t.topicId} topic={t} />
                  ))}
                </div>
              </Card>
            )}

            {performance.strongestTopics.length > 0 && (
              <Card className="p-5 sm:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Strongest Topics</h3>
                </div>
                <div className="space-y-2">
                  {performance.strongestTopics.map((t) => (
                    <TopicRow key={t.topicId} topic={t} />
                  ))}
                </div>
              </Card>
            )}

            <Card className="p-5 sm:p-6">
              <h3 className="mb-4 font-display font-semibold text-slate-800 dark:text-slate-100">Topic Performance</h3>
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {performance.topics.map((t) => (
                  <TopicRow key={t.topicId} topic={t} />
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  }

  if (phase === 'results') {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader eyebrow="Previous Year Questions" title="Results" description="Here's how your PYQ practice session went." />

        {isWeakTopicSession && (
          <div className="mb-3">
            <Badge tone="brand">
              <TrendingDown className="h-3 w-3" /> Weak Topics Practice
            </Badge>
          </div>
        )}

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
          {results.wrong > 0 && (
            <Button variant="secondary" className="flex-1" onClick={retryWrong}>
              <RotateCcw className="h-4 w-4" /> Retry Wrong ({results.wrong})
            </Button>
          )}
          <Button variant="secondary" className="flex-1" onClick={restart}>
            Start Another Test
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={cx(colors.bg, colors.text)}>{topicTitle}</Badge>
              <StatusBadge status={status} />
            </div>
            <BookmarkButton pyqId={q.id} />
          </div>
          <FormattedText text={q.question} className="text-base font-medium text-slate-800 dark:text-slate-100" />

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
                  <FormattedText text={opt.text} className="min-w-0 flex-1" />
                  {isCorrectOpt && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
                  {isUserChoice && !isCorrectOpt && <XCircle className="h-4 w-4 shrink-0 text-rose-500" />}
                </div>
              );
            })}
          </div>

          <VerificationBanner question={q} />

          <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Explanation</p>
            <FormattedText text={q.explanation} className="text-sm text-slate-600 dark:text-slate-300" />
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
      {isWeakTopicSession && (
        <div className="mb-3">
          <Badge tone="brand">
            <TrendingDown className="h-3 w-3" /> Weak Topics Practice
          </Badge>
        </div>
      )}
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
        <div className="mb-3 flex items-center justify-between gap-2">
          <Badge className={cx(colors.bg, colors.text)}>{TOPIC_TITLES[q.topicId] ?? q.subject}</Badge>
          <BookmarkButton pyqId={q.id} />
        </div>
        <motion.div
          key={q.id}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
        >
          <FormattedText text={q.question} className="text-base font-medium text-slate-800 dark:text-slate-100" />
        </motion.div>

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
                <FormattedText text={opt.text} className="min-w-0 flex-1" />
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

interface TopicPerf {
  topicId: string;
  topicTitle: string;
  subject: SubjectColorKey | undefined;
  subjectTitle: string;
  attempted: number;
  correct: number;
  wrong: number;
  accuracy: number;
}

function TopicRow({ topic }: { topic: TopicPerf }) {
  const colors = topic.subject ? SUBJECT_COLORS[topic.subject] : null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {colors && <Badge className={cx(colors.bg, colors.text)}>{topic.subjectTitle}</Badge>}
        </div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{topic.topicTitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-xs">
        <span className="text-slate-500 dark:text-slate-400">{topic.attempted} attempted</span>
        <span className="text-emerald-600 dark:text-emerald-400">{topic.correct} correct</span>
        <span className="text-rose-600 dark:text-rose-400">{topic.wrong} wrong</span>
        <span className="font-semibold text-slate-700 dark:text-slate-200">{topic.accuracy.toFixed(1)}%</span>
        <Link to={`/syllabus?topicId=${encodeURIComponent(topic.topicId)}`}>
          <Button variant="secondary" size="sm">
            <BookOpen className="h-3.5 w-3.5" /> Study
          </Button>
        </Link>
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

// Small, compact warning shown near the answer/explanation for disputed/provisional questions
// only — cross_verified and official questions render nothing here. The note is the question's
// own existing verificationNote, shown as-is (never invented or rewritten).
function VerificationBanner({ question }: { question: PYQ }) {
  const notice = getVerificationNotice(question);
  if (!notice) return null;
  const isDisputed = question.verificationStatus === 'disputed';
  return (
    <div
      className={cx(
        'mt-4 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-xs',
        isDisputed
          ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300'
          : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
      )}
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="font-semibold">{notice.label}</p>
        {notice.note && <p className="mt-0.5 text-[11px] opacity-90">{notice.note}</p>}
      </div>
    </div>
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
