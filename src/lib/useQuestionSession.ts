// Unified Question Architecture, Stage 2 — a thin React binding over questionSessionEngine.ts's
// pure state transitions. All the actual logic lives in that module (and is unit-tested there);
// this hook only wires it to useState/useRef and exposes a stable, ergonomic call surface for a
// question-session screen (currently PYQTest.tsx's testing/results/review phases).
import { useMemo, useRef, useState } from 'react';
import type { PracticeQuestion } from './types';
import {
  createEmptySessionState,
  startSession,
  loadSessionForReview,
  resetSession,
  selectAnswer as selectAnswerPure,
  clearAnswer as clearAnswerPure,
  goToNextQuestion,
  goToPreviousQuestion,
  setSessionReviewIndex,
  reviewNextQuestion,
  reviewPreviousQuestion,
  computeSessionResults,
  type QuestionSessionState,
  type QuestionSessionScoring,
} from './questionSessionEngine';

export function useQuestionSession<T extends PracticeQuestion>(scoring: QuestionSessionScoring<T>) {
  const [state, setState] = useState<QuestionSessionState<T>>(createEmptySessionState<T>);
  // A one-shot imperative guard, not reactive session data — see questionSessionEngine.ts's header
  // comment for why this is deliberately a ref, not part of QuestionSessionState.
  const submittedRef = useRef(false);

  const results = useMemo(() => computeSessionResults(state, scoring), [state, scoring]);

  return {
    questions: state.questions,
    current: state.current,
    answers: state.answers,
    reviewIndex: state.reviewIndex,
    results,

    /** Begins a fresh, answerable session — resets the submit guard. */
    start(questions: T[]) {
      submittedRef.current = false;
      setState(startSession(questions));
    },

    /** Loads a session directly into review, pre-marking it as already submitted so it can never
     * trigger a second save even if a submit control were somehow reachable from there. */
    loadForReview(questions: T[], answers: Record<string, string | null>, reviewIndex = 0) {
      submittedRef.current = true;
      setState(loadSessionForReview(questions, answers, reviewIndex));
    },

    reset() {
      setState(resetSession<T>());
    },

    selectAnswer(questionId: string, optionId: string) {
      setState((s) => selectAnswerPure(s, questionId, optionId));
    },

    clearAnswer(questionId: string) {
      setState((s) => clearAnswerPure(s, questionId));
    },

    goToNext() {
      setState(goToNextQuestion);
    },

    goToPrevious() {
      setState(goToPreviousQuestion);
    },

    setReviewIndex(index: number) {
      setState((s) => setSessionReviewIndex(s, index));
    },

    reviewNext() {
      setState(reviewNextQuestion);
    },

    reviewPrevious() {
      setState(reviewPreviousQuestion);
    },

    /** Returns true (and flips the guard) the first time it's called for this session; false on
     * every subsequent call — the exact guard PYQTest.tsx's own submittedRef implemented inline. */
    trySubmit(): boolean {
      if (submittedRef.current) return false;
      submittedRef.current = true;
      return true;
    },
  };
}
