// Unified Question Architecture, Stage 2 — the pure, framework-free question-session engine
// extracted out of PYQTest.tsx's previously-duplicated testing/results/review state management.
// Generic over any PracticeQuestion (lib/types.ts), so a future shared practice/mock screen can
// reuse this exact engine for authentic PYQs, and later, source-backed generated questions,
// without a second implementation. Scoring (marks + correctness classification) is supplied by the
// caller — this module never hardcodes PYQ's own marking scheme, so it stays reusable for a
// different question type/marking scheme without modification here.
//
// This module owns ONLY state transitions and pure derived values — no React, no store, no UI.
// The "already submitted" guard is deliberately NOT part of this state: it is an imperative,
// one-shot concern (see useQuestionSession.ts's submittedRef), not a piece of session data whose
// history matters.
import type { PracticeQuestion } from './types';

export interface QuestionSessionState<T extends PracticeQuestion> {
  questions: T[];
  current: number;
  answers: Record<string, string | null>;
  reviewIndex: number;
}

export type QuestionResultStatus = 'correct' | 'wrong' | 'unanswered';

export interface QuestionSessionResults {
  total: number;
  attempted: number;
  correct: number;
  wrong: number;
  unanswered: number;
  score: number;
  accuracy: number;
}

/** Scoring is fully caller-supplied: the marks per correct/wrong answer, and how to classify a
 * single question's answer as correct/wrong/unanswered. PYQTest.tsx passes lib/pyqPerformance's
 * existing MARKS_CORRECT/MARKS_WRONG/pyqQuestionStatus verbatim — nothing here reimplements them. */
export interface QuestionSessionScoring<T extends PracticeQuestion> {
  marksCorrect: number;
  marksWrong: number;
  statusOf: (question: T, answers: Record<string, string | null>) => QuestionResultStatus;
}

export function createEmptySessionState<T extends PracticeQuestion>(): QuestionSessionState<T> {
  return { questions: [], current: 0, answers: {}, reviewIndex: 0 };
}

/** Begins a fresh, answerable session over `questions` — used by every "start testing" entry point
 * (a filtered test, Retry Wrong, Practice Bookmarked, Practice Weak Topics). */
export function startSession<T extends PracticeQuestion>(questions: T[]): QuestionSessionState<T> {
  return { questions, current: 0, answers: {}, reviewIndex: 0 };
}

/** Loads a session directly into a reviewable (already-answered) state — used to reopen a saved
 * attempt or browse bookmarked questions, where nothing should be (re-)submitted. */
export function loadSessionForReview<T extends PracticeQuestion>(
  questions: T[],
  answers: Record<string, string | null>,
  reviewIndex = 0,
): QuestionSessionState<T> {
  return { questions, current: 0, answers, reviewIndex };
}

export function resetSession<T extends PracticeQuestion>(): QuestionSessionState<T> {
  return createEmptySessionState<T>();
}

export function selectAnswer<T extends PracticeQuestion>(state: QuestionSessionState<T>, questionId: string, optionId: string): QuestionSessionState<T> {
  return { ...state, answers: { ...state.answers, [questionId]: optionId } };
}

export function clearAnswer<T extends PracticeQuestion>(state: QuestionSessionState<T>, questionId: string): QuestionSessionState<T> {
  return { ...state, answers: { ...state.answers, [questionId]: null } };
}

/** Clamped at the last question — mirrors the "Next" button, which is never shown past the end. */
export function goToNextQuestion<T extends PracticeQuestion>(state: QuestionSessionState<T>): QuestionSessionState<T> {
  return { ...state, current: Math.min(state.questions.length - 1, state.current + 1) };
}

/** Deliberately unclamped at 0, exactly like the original PYQTest.tsx implementation — the caller's
 * "Previous" button is disabled at index 0, so this is never actually invoked there. */
export function goToPreviousQuestion<T extends PracticeQuestion>(state: QuestionSessionState<T>): QuestionSessionState<T> {
  return { ...state, current: state.current - 1 };
}

export function setSessionReviewIndex<T extends PracticeQuestion>(state: QuestionSessionState<T>, index: number): QuestionSessionState<T> {
  return { ...state, reviewIndex: index };
}

export function reviewNextQuestion<T extends PracticeQuestion>(state: QuestionSessionState<T>): QuestionSessionState<T> {
  return { ...state, reviewIndex: Math.min(state.questions.length - 1, state.reviewIndex + 1) };
}

/** Deliberately unclamped at 0 — same reasoning as goToPreviousQuestion. */
export function reviewPreviousQuestion<T extends PracticeQuestion>(state: QuestionSessionState<T>): QuestionSessionState<T> {
  return { ...state, reviewIndex: state.reviewIndex - 1 };
}

/** Tallies + scores the current session — identical arithmetic to PYQTest.tsx's original inline
 * `results` memo, just parameterized by `scoring` instead of hardcoding PYQ's marking scheme. */
export function computeSessionResults<T extends PracticeQuestion>(
  state: QuestionSessionState<T>,
  scoring: QuestionSessionScoring<T>,
): QuestionSessionResults {
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  for (const q of state.questions) {
    const s = scoring.statusOf(q, state.answers);
    if (s === 'correct') correct += 1;
    else if (s === 'wrong') wrong += 1;
    else unanswered += 1;
  }
  const attempted = correct + wrong;
  const total = state.questions.length;
  const score = correct * scoring.marksCorrect + wrong * scoring.marksWrong;
  const accuracy = attempted > 0 ? (correct / attempted) * 100 : 0;
  return { total, attempted, correct, wrong, unanswered, score, accuracy };
}
