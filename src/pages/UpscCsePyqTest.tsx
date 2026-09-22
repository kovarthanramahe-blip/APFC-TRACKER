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
  RotateCcw,
  ArrowLeft,
  BookOpen,
  History,
  Star,
  BarChart3,
  TrendingDown,
  TrendingUp,
  Brain,
  Target,
} from 'lucide-react';
import { UPSC_CSE_PRELIMS_PYQ_BANK } from '../data/pyqUpscCsePrelims';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';
import { useAppStore } from '../lib/store';
import { getWorkspaceMeta } from '../lib/workspace';
import { getLocalDateString, cx, uuid } from '../lib/utils';
import { Card, Button, Badge, PageHeader, ProgressBar, WorkspaceComingSoon } from '../components/ui/Primitives';
import { FormattedText } from '../components/ui/FormattedText';
import type { UpscCsePrelimsBatchPyq } from '../lib/upscCsePrelimsPyqBatchImport';
import type { UpscCsePrelimsPyqAttempt } from '../lib/upscCsePrelimsPyqAttempt';
import {
  getAvailableYears,
  getYearCounts,
  formatYearLabel,
  getAvailablePapers,
  getSubjectCounts,
  getMicrosyllabusCounts,
  computeRevisionStatusMap,
  computeEligibleRevisionIds,
  filterUpscCsePrelimsPyqs,
  questionSubject,
  questionMicrosyllabusId,
  UNMAPPED_MICROSYLLABUS,
  parseRevisionFilterParam,
  type UpscCsePrelimsRevisionFilter,
} from '../lib/upscCsePrelimsPyqFilters';
import {
  computeUpscCsePrelimsPerformance,
  upscCsePrelimsQuestionStatus as statusOf,
  type UpscCsePrelimsQuestionStatus as QuestionStatus,
  type UpscCsePrelimsMicrosyllabusPerformance,
} from '../lib/upscCsePrelimsPyqPerformance';
import { getMicrosyllabusItemById } from '../lib/upscCseSyllabus';
import { getDueItems } from '../lib/revisionQueue';
import { useQuestionSession } from '../lib/useQuestionSession';
import type { QuestionSessionScoring } from '../lib/questionSessionEngine';
import { resolveTestingKeyAction } from '../lib/questionKeyboardShortcuts';

// UPSC CSE Prelims PYQ Practice & Analytics — a dedicated page for the 100-question 2026 GS Paper I
// dataset (data/pyqUpscCsePrelims.ts), reusing the SAME generic question-session engine
// (lib/useQuestionSession + lib/questionSessionEngine) and workspace-owned store fields
// (bookmarkedPyqIds, revisionQueue) pages/PYQTest.tsx already uses for APFC — neither of those is
// APFC-specific, so nothing there needed duplicating. Deliberately NOT built into pages/PYQTest.tsx
// itself or wired through data/registry.ts's getPyqBankForWorkspace: that resolver and PYQTest.tsx
// are both typed around lib/types.ts's PYQ, which mandates `subject: SubjectColorKey` (APFC's own
// closed 13-value union) and a mandatory correctOptionId/explanation — a genuine UPSC CSE record
// (freeform subject strings, a microsyllabus id instead of a topicId, no explanation data at all)
// cannot satisfy that shape without fabricating fields, so this page reads
// UPSC_CSE_PRELIMS_PYQ_BANK directly and uses its own small, parallel filter/performance helpers
// (lib/upscCsePrelimsPyqFilters.ts, lib/upscCsePrelimsPyqPerformance.ts) — same design as PYQTest's
// own, adapted to the real data shape, never forcing an incompatible type through a shared module.
//
// No explanation exists anywhere in this dataset (see lib/upscCsePrelimsPyqBatchImport.ts — the
// supplied batches never included one) — the Review screen says so plainly rather than omitting the
// section or inventing text. No marks-based "score": this app has no authoritative UPSC CSE marking
// scheme on file, so results only ever show real, derived counts (correct/wrong/unanswered/accuracy),
// never a fabricated point total.

const COUNT_OPTIONS = [10, 20, 30, 50] as const;
type CountChoice = (typeof COUNT_OPTIONS)[number] | 'all';

const AVAILABLE_YEARS = getAvailableYears(UPSC_CSE_PRELIMS_PYQ_BANK);
const YEAR_COUNTS = getYearCounts(UPSC_CSE_PRELIMS_PYQ_BANK);
const AVAILABLE_PAPERS = getAvailablePapers(UPSC_CSE_PRELIMS_PYQ_BANK);

const SCORING: QuestionSessionScoring<UpscCsePrelimsBatchPyq> = { marksCorrect: 1, marksWrong: 0, statusOf };

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function microsyllabusLabel(id: string): string {
  if (id === UNMAPPED_MICROSYLLABUS) return 'Needs Review';
  return getMicrosyllabusItemById(UPSC_CSE_PRELIMS_SYLLABUS, id)?.title ?? id;
}

function BookmarkButton({ pyqId }: { pyqId: string }) {
  const isBookmarked = useAppStore((s) => s.bookmarkedPyqIds.includes(pyqId));
  const toggleBookmarkedPyq = useAppStore((s) => s.toggleBookmarkedPyq);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        toggleBookmarkedPyq(pyqId);
      }}
      title={isBookmarked ? 'Remove from revision' : 'Mark for revision'}
      className={cx('shrink-0 rounded-lg p-1.5 transition-colors', isBookmarked ? 'text-gold-500' : 'text-slate-300 hover:text-gold-500 dark:text-slate-600')}
    >
      <Star className={cx('h-4.5 w-4.5', isBookmarked && 'fill-gold-400')} />
    </button>
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

function MicrosyllabusRow({ row }: { row: UpscCsePrelimsMicrosyllabusPerformance }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {row.subject && <Badge tone="neutral">{row.subject}</Badge>}
        <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{row.title}</p>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-xs">
        <span className="text-slate-500 dark:text-slate-400">{row.attempted} attempted</span>
        <span className="text-emerald-600 dark:text-emerald-400">{row.correct} correct</span>
        <span className="text-rose-600 dark:text-rose-400">{row.wrong} wrong</span>
        <span className="font-semibold text-slate-700 dark:text-slate-200">{row.accuracy.toFixed(1)}%</span>
        {row.microsyllabusId !== UNMAPPED_MICROSYLLABUS && (
          <Link to={`/upsc-syllabus?microsyllabusId=${encodeURIComponent(row.microsyllabusId)}`}>
            <Button variant="secondary" size="sm">
              <BookOpen className="h-3.5 w-3.5" /> Study
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

type Phase = 'select' | 'testing' | 'results' | 'review' | 'bookmarks' | 'analytics' | 'revise';

export default function UpscCsePyqTest() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const attempts = useAppStore((s) => s.upscCsePrelimsPyqAttempts);
  const addAttempt = useAppStore((s) => s.addUpscCsePrelimsPyqAttempt);
  const bookmarkedPyqIds = useAppStore((s) => s.bookmarkedPyqIds);
  const revisionQueue = useAppStore((s) => s.revisionQueue);
  const recordRevisionCorrect = useAppStore((s) => s.recordRevisionCorrect);
  const recordRevisionIncorrect = useAppStore((s) => s.recordRevisionIncorrect);

  // Deep-link support: the UPSC CSE Study Dashboard's "Today's Study" items arrive as
  // /upsc-pyq-test?microsyllabusId=...&revisionFilter=...&view=revision|revise — read once at
  // mount (useState's lazy initializer), same convention as pages/UpscCseSyllabus.tsx's own
  // ?microsyllabusId= deep link and pages/PYQTest.tsx's own ?mode=weak_topics auto-start below.
  const [searchParams] = useSearchParams();
  const initialView = searchParams.get('view');
  const autoStartRevisionRef = useRef(false);

  const [phase, setPhase] = useState<Phase>(() => (initialView === 'revision' ? 'bookmarks' : 'select'));

  const [year, setYear] = useState<number | 'all'>('all');
  const [paper, setPaper] = useState<string | 'all'>('all');
  const [subject, setSubject] = useState<string | 'all'>('all');
  const [microsyllabusId, setMicrosyllabusId] = useState<string | 'all'>(() => searchParams.get('microsyllabusId') ?? 'all');
  const [revisionFilter, setRevisionFilter] = useState<UpscCsePrelimsRevisionFilter>(() => parseRevisionFilterParam(searchParams.get('revisionFilter')));
  const [countChoice, setCountChoice] = useState<CountChoice>(10);

  const session = useQuestionSession<UpscCsePrelimsBatchPyq>(SCORING);
  const { questions, current, answers, reviewIndex, results } = session;

  const questionRevisionStatus = useMemo(() => computeRevisionStatusMap(UPSC_CSE_PRELIMS_PYQ_BANK, attempts), [attempts]);

  const filtered = useMemo(
    () =>
      filterUpscCsePrelimsPyqs(UPSC_CSE_PRELIMS_PYQ_BANK, {
        year,
        paper,
        subject,
        microsyllabusId,
        revisionFilter,
        revisionStatusMap: questionRevisionStatus,
      }),
    [year, paper, subject, microsyllabusId, revisionFilter, questionRevisionStatus],
  );

  const paperCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of UPSC_CSE_PRELIMS_PYQ_BANK) {
      if (year !== 'all' && p.year !== year) continue;
      if (p.paper === undefined) continue;
      counts[p.paper] = (counts[p.paper] ?? 0) + 1;
    }
    return counts;
  }, [year]);

  const subjectCounts = useMemo(() => getSubjectCounts(UPSC_CSE_PRELIMS_PYQ_BANK, year, paper), [year, paper]);
  const subjectsAvailable = useMemo(() => Object.keys(subjectCounts).sort((a, b) => a.localeCompare(b)), [subjectCounts]);
  const paperPoolCount = Object.values(paperCounts).reduce((s, c) => s + c, 0);

  const microsyllabusCounts = useMemo(() => getMicrosyllabusCounts(UPSC_CSE_PRELIMS_PYQ_BANK, year, paper, subject), [year, paper, subject]);
  const microsyllabusOptions = useMemo(
    () => microsyllabusCounts.map(({ id, count }) => ({ id, count, title: microsyllabusLabel(id) })).sort((a, b) => a.title.localeCompare(b.title)),
    [microsyllabusCounts],
  );
  const subjectPoolCount = microsyllabusCounts.reduce((sum, m) => sum + m.count, 0);

  useEffect(() => {
    setSubject('all');
  }, [year, paper]);
  useEffect(() => {
    setMicrosyllabusId('all');
  }, [subject, year, paper]);

  const availableCountOptions = COUNT_OPTIONS.filter((n) => n <= filtered.length);
  useEffect(() => {
    if (countChoice !== 'all' && countChoice > filtered.length) {
      setCountChoice(availableCountOptions.length > 0 ? availableCountOptions[availableCountOptions.length - 1] : 'all');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length]);

  // Keyboard shortcuts — same rules as pages/PYQTest.tsx's own testing screen (see
  // lib/questionKeyboardShortcuts.ts, fully generic and reused as-is).
  useEffect(() => {
    if (phase !== 'testing') return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const q = questions[current];
      if (!q) return;
      const action = resolveTestingKeyAction(e.key, q.options.length);
      if (action.type === 'selectOption') {
        e.preventDefault();
        session.selectAnswer(q.id, q.options[action.index].id);
      } else if (action.type === 'next' && current < questions.length - 1) {
        e.preventDefault();
        session.goToNext();
      } else if (action.type === 'previous' && current > 0) {
        e.preventDefault();
        session.goToPrevious();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, current, questions]);

  function startTest() {
    if (filtered.length === 0) return;
    const n = countChoice === 'all' ? filtered.length : Math.min(countChoice, filtered.length);
    session.start(shuffle(filtered).slice(0, n));
    setPhase('testing');
  }

  function handleSubmit() {
    if (session.trySubmit()) {
      const attempt: UpscCsePrelimsPyqAttempt = {
        id: uuid(),
        submittedAt: new Date().toISOString(),
        year,
        paper,
        subject,
        microsyllabusId,
        questionIds: questions.map((q) => q.id),
        answers,
        correctCount: results.correct,
        wrongCount: results.wrong,
        unansweredCount: results.unanswered,
        accuracy: results.accuracy,
      };
      addAttempt(attempt);
    }
    setPhase('results');
  }

  function restart() {
    session.reset();
    setPhase('select');
  }

  function openAttempt(attempt: UpscCsePrelimsPyqAttempt) {
    const qs = attempt.questionIds.map((id) => UPSC_CSE_PRELIMS_PYQ_BANK.find((p) => p.id === id)).filter((q): q is UpscCsePrelimsBatchPyq => !!q);
    session.loadForReview(qs, attempt.answers, 0);
    setPhase('results');
  }

  function retryWrong() {
    const wrongQs = questions.filter((q) => statusOf(q, answers) === 'wrong');
    if (wrongQs.length === 0) return;
    session.start(wrongQs);
    setPhase('testing');
  }

  const bookmarkedQuestions = useMemo(
    () => bookmarkedPyqIds.map((id) => UPSC_CSE_PRELIMS_PYQ_BANK.find((p) => p.id === id)).filter((q): q is UpscCsePrelimsBatchPyq => !!q),
    [bookmarkedPyqIds],
  );

  function openBookmarks(startAt = 0) {
    if (bookmarkedQuestions.length === 0) return;
    session.loadForReview(bookmarkedQuestions, {}, Math.min(startAt, bookmarkedQuestions.length - 1));
    setPhase('review');
  }

  function practiceBookmarked() {
    if (bookmarkedQuestions.length === 0) return;
    session.start(bookmarkedQuestions);
    setPhase('testing');
  }

  const performance = useMemo(() => computeUpscCsePrelimsPerformance(UPSC_CSE_PRELIMS_PYQ_BANK, attempts, UPSC_CSE_PRELIMS_SYLLABUS), [attempts]);

  const eligibleRevisionIds = useMemo(
    () => computeEligibleRevisionIds(UPSC_CSE_PRELIMS_PYQ_BANK, questionRevisionStatus, bookmarkedPyqIds),
    [questionRevisionStatus, bookmarkedPyqIds],
  );
  const dueRevisionItems = useMemo(() => getDueItems(revisionQueue, eligibleRevisionIds, getLocalDateString()), [revisionQueue, eligibleRevisionIds]);

  const [reviseQuestions, setReviseQuestions] = useState<UpscCsePrelimsBatchPyq[]>([]);
  const [reviseIndex, setReviseIndex] = useState(0);
  const [reviseAnswer, setReviseAnswer] = useState<string | null>(null);
  const [reviseChecked, setReviseChecked] = useState(false);
  const [reviseCorrectCount, setReviseCorrectCount] = useState(0);
  const [reviseComplete, setReviseComplete] = useState(false);
  const reviseRecordedRef = useRef<Set<string>>(new Set());

  function startRevision() {
    if (dueRevisionItems.length === 0) return;
    const qs = dueRevisionItems.map((item) => UPSC_CSE_PRELIMS_PYQ_BANK.find((p) => p.id === item.pyqId)).filter((q): q is UpscCsePrelimsBatchPyq => !!q);
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
    if (q.correctOptionId !== undefined && reviseAnswer === q.correctOptionId) {
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

  // Deep-link support: /upsc-pyq-test?view=revise auto-starts the same Revise Now session as the
  // "select" screen's own button, once per page load — mirrors pages/PYQTest.tsx's own
  // ?mode=weak_topics auto-start. If nothing is due, this simply does nothing and the user lands
  // on the select screen, exactly like clicking the (disabled) button manually would.
  useEffect(() => {
    if (autoStartRevisionRef.current) return;
    if (initialView !== 'revise') return;
    autoStartRevisionRef.current = true;
    if (dueRevisionItems.length > 0) startRevision();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialView, dueRevisionItems]);

  if (activeWorkspaceId !== 'upsc_cse') {
    return (
      <div>
        <PageHeader eyebrow="UPSC CSE" title="PYQs" />
        <WorkspaceComingSoon icon={History} workspaceLabel={getWorkspaceMeta(activeWorkspaceId).shortLabel} />
      </div>
    );
  }

  if (phase === 'select') {
    return (
      <div>
        <PageHeader
          eyebrow="UPSC CSE · Previous Year Questions"
          title="PYQs"
          description="Practice with the UPSC CSE Prelims 2026 GS Paper I question set (Set A answer key) — user-supplied, provisional source; always cross-check against the original paper."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => setPhase('analytics')}>
                <BarChart3 className="h-4 w-4" /> Performance
              </Button>
              <Button variant="secondary" onClick={() => setPhase('bookmarks')}>
                <Star className={cx('h-4 w-4', bookmarkedQuestions.length > 0 && 'fill-gold-400 text-gold-500')} />
                Revision Questions{bookmarkedQuestions.length > 0 ? ` (${bookmarkedQuestions.length})` : ''}
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
                All Years ({UPSC_CSE_PRELIMS_PYQ_BANK.length})
              </SelectChip>
              {AVAILABLE_YEARS.map((y) => (
                <SelectChip key={y} active={year === y} onClick={() => setYear(y)}>
                  {y} ({YEAR_COUNTS[y]})
                </SelectChip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Paper</p>
            <div className="flex flex-wrap gap-2">
              <SelectChip active={paper === 'all'} onClick={() => setPaper('all')}>
                All Papers ({paperPoolCount})
              </SelectChip>
              {AVAILABLE_PAPERS.map((p) => (
                <SelectChip key={p} active={paper === p} onClick={() => setPaper(p)}>
                  {p} ({paperCounts[p] ?? 0})
                </SelectChip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Subject</p>
            <div className="flex flex-wrap gap-2">
              <SelectChip active={subject === 'all'} onClick={() => setSubject('all')}>
                All Subjects ({paperPoolCount})
              </SelectChip>
              {subjectsAvailable.map((s) => (
                <SelectChip key={s} active={subject === s} onClick={() => setSubject(s)}>
                  {s} ({subjectCounts[s] ?? 0})
                </SelectChip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Microsyllabus</p>
            <div className="flex flex-wrap gap-2">
              <SelectChip active={microsyllabusId === 'all'} onClick={() => setMicrosyllabusId('all')}>
                All ({subjectPoolCount})
              </SelectChip>
              {microsyllabusOptions.map((m) => (
                <SelectChip key={m.id} active={microsyllabusId === m.id} onClick={() => setMicrosyllabusId(m.id)}>
                  {m.title} ({m.count})
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

        {attempts.length > 0 && (
          <Card className="mt-6 p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <History className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Attempt History</h3>
            </div>
            <div className="space-y-2">
              {attempts.map((a) => (
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
          eyebrow="UPSC CSE · Previous Year Questions"
          title="Revision Questions"
          description={
            bookmarkedQuestions.length > 0
              ? `${bookmarkedQuestions.length} question${bookmarkedQuestions.length === 1 ? '' : 's'} marked for revision.`
              : 'Questions you mark for revision while practicing will show up here.'
          }
          action={bookmarkedQuestions.length > 0 ? <Button onClick={practiceBookmarked}>Practice These</Button> : undefined}
        />

        {bookmarkedQuestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Star className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
            <p className="text-slate-400 text-sm">No questions marked for revision yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookmarkedQuestions.map((q, idx) => (
              <Card key={q.id} className="p-4 cursor-pointer" onClick={() => openBookmarks(idx)}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-xs font-semibold text-slate-300 dark:text-slate-600 w-6 shrink-0">{idx + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      {q.year !== undefined && <Badge tone="neutral">{q.year}</Badge>}
                      <Badge tone="neutral">{questionSubject(q)}</Badge>
                      <Badge tone={q.mappingStatus === 'mapped' ? 'brand' : 'warning'}>{microsyllabusLabel(questionMicrosyllabusId(q))}</Badge>
                    </div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-2">{q.question}</p>
                  </div>
                  <BookmarkButton pyqId={q.id} />
                </div>
              </Card>
            ))}
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
            <Badge tone="neutral">{microsyllabusLabel(questionMicrosyllabusId(q))}</Badge>
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
            <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Explanation</p>
              <p className="text-sm text-slate-400">No explanation available for this question yet.</p>
            </div>
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

        <PageHeader eyebrow="UPSC CSE · Previous Year Questions" title="Performance" description="How you're doing across all your UPSC CSE PYQ practice tests so far." />

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
                <StatTile label="Unattempted (bank)" value={`${performance.unattemptedCount}`} />
              </div>
            </Card>

            <Card className="p-5 sm:p-6">
              <h3 className="mb-4 font-display font-semibold text-slate-800 dark:text-slate-100">Performance by Year / Paper</h3>
              <div className="space-y-2">
                {performance.yearPaper.map((yp) => (
                  <div
                    key={`${yp.year}::${yp.paper}`}
                    className="flex flex-col gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral">{yp.year}</Badge>
                      <Badge tone="neutral">{yp.paper}</Badge>
                      <span className="text-xs text-slate-400">
                        {yp.testCount} test{yp.testCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <span className="text-slate-500 dark:text-slate-400">{yp.attempted} attempted</span>
                      <span className="text-emerald-600 dark:text-emerald-400">{yp.correct} correct</span>
                      <span className="text-rose-600 dark:text-rose-400">{yp.wrong} wrong</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{yp.attempted > 0 ? `${yp.accuracy.toFixed(1)}%` : '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5 sm:p-6">
              <h3 className="mb-4 font-display font-semibold text-slate-800 dark:text-slate-100">Subject Performance</h3>
              <div className="space-y-2">
                {performance.subjects.map((s) => (
                  <div
                    key={s.subject}
                    className="flex flex-col gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral">{s.subject}</Badge>
                      <span className="text-xs text-slate-400">
                        {s.testCount} test{s.testCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-slate-500 dark:text-slate-400">{s.attempted} attempted</span>
                      <span className="text-emerald-600 dark:text-emerald-400">{s.correct} correct</span>
                      <span className="text-rose-600 dark:text-rose-400">{s.wrong} wrong</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{s.attempted > 0 ? `${s.accuracy.toFixed(1)}%` : '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {performance.weakMicrosyllabus.length > 0 && (
              <Card className="p-5 sm:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-rose-500" />
                  <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Microsyllabus to Improve</h3>
                </div>
                <div className="space-y-2">
                  {performance.weakMicrosyllabus.map((m) => (
                    <MicrosyllabusRow key={m.microsyllabusId} row={m} />
                  ))}
                </div>
              </Card>
            )}

            {performance.strongestMicrosyllabus.length > 0 && (
              <Card className="p-5 sm:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Strongest Microsyllabus</h3>
                </div>
                <div className="space-y-2">
                  {performance.strongestMicrosyllabus.map((m) => (
                    <MicrosyllabusRow key={m.microsyllabusId} row={m} />
                  ))}
                </div>
              </Card>
            )}

            <Card className="p-5 sm:p-6">
              <h3 className="mb-4 font-display font-semibold text-slate-800 dark:text-slate-100">Microsyllabus Performance</h3>
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {performance.microsyllabus.map((m) => (
                  <MicrosyllabusRow key={m.microsyllabusId} row={m} />
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
        <PageHeader eyebrow="UPSC CSE · Previous Year Questions" title="Results" description="Here's how your PYQ practice session went." />

        <Card className="mb-5 p-5 sm:p-6 text-center">
          <Target className="mx-auto h-8 w-8 text-brand-500" />
          <p className="mt-2 text-xs text-slate-400">Accuracy</p>
          <p className="font-display text-4xl font-bold text-slate-900 dark:text-white">{results.accuracy.toFixed(1)}%</p>
          <p className="mt-1 text-xs text-slate-400">{results.correct} correct / {results.attempted} attempted</p>
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
              session.setReviewIndex(0);
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
    const microId = questionMicrosyllabusId(q);

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
              <Badge tone={q.mappingStatus === 'mapped' ? 'brand' : 'warning'}>{microsyllabusLabel(microId)}</Badge>
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

          <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Explanation</p>
            <p className="text-sm text-slate-400">No explanation available for this question yet.</p>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <p className="text-xs text-slate-400">
              <span className="font-medium text-slate-500 dark:text-slate-400">{questionSubject(q)}</span> · {microsyllabusLabel(microId)}
            </p>
            {microId !== UNMAPPED_MICROSYLLABUS && (
              <Link to={`/upsc-syllabus?microsyllabusId=${encodeURIComponent(microId)}`}>
                <Button variant="secondary" size="sm">
                  <BookOpen className="h-3.5 w-3.5" /> Study this microsyllabus
                </Button>
              </Link>
            )}
          </div>
        </Card>

        <div className="mt-4 flex items-center justify-between gap-3">
          <Button variant="secondary" disabled={reviewIndex === 0} onClick={session.reviewPrevious}>
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          <Button variant="secondary" disabled={reviewIndex === questions.length - 1} onClick={session.reviewNext}>
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
                  onClick={() => session.setReviewIndex(i)}
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
        <div className="mb-3 flex items-center justify-between gap-2">
          <Badge tone="neutral">{questionSubject(q)}</Badge>
          <BookmarkButton pyqId={q.id} />
        </div>
        <motion.div key={q.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
          <FormattedText text={q.question} className="text-base font-medium text-slate-800 dark:text-slate-100" />
        </motion.div>

        <div className="mt-5 space-y-2.5">
          {q.options.map((opt) => {
            const selected = answers[q.id] === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => session.selectAnswer(q.id, opt.id)}
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
          <button className="mt-3 text-xs text-slate-400 hover:underline" onClick={() => session.clearAnswer(q.id)}>
            Clear response
          </button>
        )}
      </Card>

      <p className="mt-3 hidden text-center text-[11px] text-slate-400 sm:block">
        Keyboard: press <span className="font-semibold">1-{q.options.length}</span> to select an option, <span className="font-semibold">←</span>/
        <span className="font-semibold">→</span> to navigate
      </p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Button variant="secondary" disabled={current === 0} onClick={session.goToPrevious}>
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>
        {current === questions.length - 1 ? (
          <Button onClick={() => confirm('Submit the test now?') && handleSubmit()}>Submit Test</Button>
        ) : (
          <Button onClick={session.goToNext}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
