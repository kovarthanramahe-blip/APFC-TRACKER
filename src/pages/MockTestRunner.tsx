import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, ChevronLeft, ChevronRight, Flag, X } from 'lucide-react';
import { getBlueprint } from '../data/mockTests';
import { PYQ_BANK } from '../data/pyq';
import { QUESTION_BANK } from '../data/questionBank';
import { useAppStore } from '../lib/store';
import { cx, uuid, SUBJECT_COLORS } from '../lib/utils';
import { Button, Card } from '../components/ui/Primitives';
import type { MockTestAttempt } from '../lib/types';
import { useQuestionSession } from '../lib/useQuestionSession';
import type { QuestionResultStatus, QuestionSessionScoring } from '../lib/questionSessionEngine';
import { buildQuestionCatalog, type CatalogQuestion } from '../lib/questionCatalog';
import { selectMockQuestionPool } from '../lib/mockQuestionPool';
import { resolveTestingKeyAction } from '../lib/questionKeyboardShortcuts';

// Mock Test's own correctness classifier — structurally identical to lib/pyqPerformance's
// pyqQuestionStatus, but typed for CatalogQuestion (lib/questionCatalog.ts, Stage 4/5B). Kept
// generic over CatalogQuestion rather than narrowed to 'practice_bank' only, since correctness
// classification doesn't depend on provenance — which entries actually reach this function is a
// selection-policy question, handled explicitly by lib/mockQuestionPool.ts (Stage 5C), not here.
function mockQuestionStatus(q: CatalogQuestion, answers: Record<string, string | null>): QuestionResultStatus {
  const ans = answers[q.id];
  if (!ans) return 'unanswered';
  return ans === q.correctOptionId ? 'correct' : 'wrong';
}

export default function MockTestRunner() {
  const { blueprintId } = useParams();
  const navigate = useNavigate();
  const addAttempt = useAppStore((s) => s.addAttempt);

  const blueprint = blueprintId ? getBlueprint(blueprintId) : undefined;

  // Unified Question Architecture Stage 5C — the full catalog (both sources) is built once, and
  // selectMockQuestionPool's own default policy (practice-bank only) is what actually keeps PYQs
  // out of the pool — an explicit, tested filter rather than an implicit guarantee from only ever
  // mapping QUESTION_BANK. data/mockTests.ts's blueprint definitions, subject filtering, shuffle,
  // and questionCount capping are all reused verbatim inside selectMockQuestionPool; nothing about
  // blueprint composition changed, only how the pool that feeds it is assembled.
  const catalog = useMemo(() => buildQuestionCatalog(PYQ_BANK, QUESTION_BANK), []);
  const pickedQuestions = useMemo(() => (blueprint ? selectMockQuestionPool(catalog, blueprint) : []), [blueprint, catalog]);

  // The same shared testing engine PYQTest.tsx uses (lib/questionSessionEngine.ts), with Mock
  // Test's own blueprint-driven marking scheme (not PYQ's fixed 2.5/-0.833333) supplied as data;
  // the engine itself stays unaware of either.
  const scoring: QuestionSessionScoring<CatalogQuestion> = useMemo(
    () => ({
      marksCorrect: blueprint?.marksPerCorrect ?? 0,
      marksWrong: blueprint ? -(blueprint.marksPerCorrect * blueprint.negativeMarkFraction) : 0,
      statusOf: mockQuestionStatus,
    }),
    [blueprint],
  );
  const session = useQuestionSession<CatalogQuestion>(scoring);
  const { questions, current, answers, results } = session;

  const [started, setStarted] = useState(false);
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [secondsLeft, setSecondsLeft] = useState((blueprint?.durationMinutes ?? 0) * 60);
  const startedAtRef = useRef<string>('');

  // The countdown effect below only ever runs once per test (its deps are `[started]`, and
  // `started` flips true exactly once), so the `handleSubmit` it captured at that moment would
  // otherwise stay frozen with whatever `answers` existed right when the timer started — silently
  // dropping every answer given afterward if the clock ever actually reaches zero. This ref is kept
  // pointed at the latest `handleSubmit` (redeclared fresh every render, closing over the current
  // `session.answers`/`session.results`) via a no-dependency effect that runs after every render,
  // so the interval always calls the up-to-date version without needing to be torn down and
  // re-created — the smallest fix that doesn't touch the countdown/interval mechanics themselves.
  const handleSubmitRef = useRef<() => void>(() => {});
  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  });

  useEffect(() => {
    if (!started) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          handleSubmitRef.current();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // Keyboard shortcuts once the test is running — same mapping as pages/PYQTest.tsx's testing
  // screen (lib/questionKeyboardShortcuts.ts, reused verbatim, not re-implemented): 1-N/a-z select
  // an option, arrow keys navigate. No shortcut submits the test — that stays a deliberate,
  // confirmed click only. Ignores modifier-key combinations and real input/textarea/select focus.
  // `session`'s methods close over this component's own `setState` via a functional updater (see
  // lib/useQuestionSession.ts), so omitting the fresh-every-render `session` object from deps below
  // never causes a stale update.
  useEffect(() => {
    if (!started) return;
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
  }, [started, current, questions]);

  if (!blueprint) {
    return (
      <div className="py-20 text-center">
        <p className="text-slate-500">Test not found.</p>
        <Link to="/mock-tests" className="text-brand-600 hover:underline text-sm">
          Back to Mock Tests
        </Link>
      </div>
    );
  }

  function handleSubmit() {
    if (!session.trySubmit()) return;

    // Per-subject aggregation is Mock-Test-specific (the shared engine's results are subject-
    // agnostic), so it stays a local loop here, reusing the same mockQuestionStatus classifier
    // handed to the engine above — one classification rule, not two.
    const subjectBreakdown: MockTestAttempt['subjectBreakdown'] = {};
    questions.forEach((q) => {
      const bd = subjectBreakdown[q.subject] ?? { correct: 0, wrong: 0, skipped: 0, total: 0 };
      bd.total += 1;
      const status = mockQuestionStatus(q, answers);
      if (status === 'unanswered') bd.skipped += 1;
      else if (status === 'correct') bd.correct += 1;
      else bd.wrong += 1;
      subjectBreakdown[q.subject] = bd;
    });

    // Same rounding the original implementation applied before persisting — the engine's raw
    // `results.score` (correct*marksCorrect + wrong*marksWrong, mathematically identical to the
    // original's correct*marksPerCorrect - wrong*marksPerCorrect*negativeMarkFraction) is rounded
    // here exactly as before, so the persisted value is unchanged bit-for-bit.
    const score = Math.round(results.score * 100) / 100;
    const maxScore = results.total * blueprint!.marksPerCorrect;

    const attempt: MockTestAttempt = {
      id: uuid(),
      blueprintId: blueprint!.id,
      blueprintTitle: blueprint!.title,
      startedAt: startedAtRef.current,
      submittedAt: new Date().toISOString(),
      durationMinutes: blueprint!.durationMinutes,
      questionIds: questions.map((q) => q.id),
      answers,
      correctCount: results.correct,
      wrongCount: results.wrong,
      skippedCount: results.unanswered,
      score,
      maxScore,
      subjectBreakdown,
    };
    addAttempt(attempt);
    navigate(`/mock-tests/result/${attempt.id}`, { replace: true });
  }

  if (!started) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card className="p-6 sm:p-8 text-center">
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">{blueprint.title}</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{blueprint.description}</p>
          <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
            <InfoTile label="Questions" value={`${pickedQuestions.length}`} />
            <InfoTile label="Duration" value={`${blueprint.durationMinutes}m`} />
            <InfoTile label="Negative Mark" value="1/3" />
          </div>
          <p className="mt-6 text-xs text-slate-400">
            +{blueprint.marksPerCorrect} for each correct answer, −{(blueprint.marksPerCorrect * blueprint.negativeMarkFraction).toFixed(2)} for each wrong answer. Unattempted questions are not penalised.
          </p>
          <Button
            className="mt-6 w-full"
            onClick={() => {
              startedAtRef.current = new Date().toISOString();
              session.start(pickedQuestions);
              setStarted(true);
            }}
          >
            Begin Test
          </Button>
          <Link to="/mock-tests" className="mt-3 block text-xs text-slate-400 hover:underline">
            Cancel and go back
          </Link>
        </Card>
      </div>
    );
  }

  const q = questions[current];
  const colors = SUBJECT_COLORS[q.subject];
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const lowTime = secondsLeft < 60;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Question {current + 1} of {questions.length}
          </p>
          <div className={cx('flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold', lowTime ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200')}>
            <Clock className="h-3.5 w-3.5" />
            {mins}:{secs.toString().padStart(2, '0')}
          </div>
        </div>

        <Card className="p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-medium', colors.bg, colors.text)}>{q.topicLabel}</span>
            <button
              onClick={() => setFlagged((f) => ({ ...f, [q.id]: !f[q.id] }))}
              className={cx('flex items-center gap-1 text-xs font-medium', flagged[q.id] ? 'text-gold-600' : 'text-slate-400 hover:text-slate-600')}
            >
              <Flag className={cx('h-3.5 w-3.5', flagged[q.id] && 'fill-gold-400')} /> {flagged[q.id] ? 'Flagged' : 'Flag for review'}
            </button>
          </div>
          <motion.p
            key={q.id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="text-base font-medium text-slate-800 dark:text-slate-100"
          >
            {q.question}
          </motion.p>

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
                  {opt.text}
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

      {/* Question navigator */}
      <Card className="hidden lg:block p-4 h-fit sticky top-24">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Navigator</p>
          <button onClick={() => confirm('Submit the test now?') && handleSubmit()} className="text-slate-400 hover:text-rose-500">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {questions.map((qq, i) => {
            const answered = !!answers[qq.id];
            const isCurrent = i === current;
            return (
              <button
                key={qq.id}
                onClick={() => session.goToQuestion(i)}
                className={cx(
                  'relative h-8 w-8 rounded-lg text-xs font-semibold transition-colors',
                  isCurrent
                    ? 'bg-brand-600 text-white'
                    : answered
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                )}
              >
                {i + 1}
                {flagged[qq.id] && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-gold-500" />}
              </button>
            );
          })}
        </div>
        <div className="mt-4 space-y-1.5 text-xs text-slate-400">
          <p>
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 mr-1.5" /> Answered: {Object.values(answers).filter(Boolean).length}
          </p>
          <p>
            <span className="inline-block h-2 w-2 rounded-full bg-slate-300 mr-1.5" /> Unanswered: {questions.length - Object.values(answers).filter(Boolean).length}
          </p>
        </div>
      </Card>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 py-3">
      <p className="font-display font-bold text-slate-800 dark:text-slate-100">{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}
