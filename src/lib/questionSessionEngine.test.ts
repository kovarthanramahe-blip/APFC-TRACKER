import { describe, it, expect } from 'vitest';
import type { PracticeQuestion } from './types';
import {
  createEmptySessionState,
  startSession,
  loadSessionForReview,
  resetSession,
  selectAnswer,
  clearAnswer,
  goToNextQuestion,
  goToPreviousQuestion,
  setSessionCurrent,
  setSessionReviewIndex,
  reviewNextQuestion,
  reviewPreviousQuestion,
  computeSessionResults,
  type QuestionSessionScoring,
} from './questionSessionEngine';

// A minimal, deliberately non-PYQ PracticeQuestion fixture — proves the engine is genuinely
// generic (lib/types.ts's PracticeQuestion base), not secretly PYQ-shaped.
function question(id: string, correctOptionId = `${id}-correct`): PracticeQuestion {
  return {
    id,
    subject: 'polity',
    topicId: 't-1',
    question: `Question ${id}?`,
    options: [
      { id: correctOptionId, text: 'Correct option' },
      { id: `${id}-wrong`, text: 'Wrong option' },
    ],
    correctOptionId,
    explanation: 'Because.',
  };
}

// Standard status classifier mirroring lib/pyqPerformance's pyqQuestionStatus exactly, but
// generic — the engine never assumes this specific implementation.
function statusOf(q: PracticeQuestion, answers: Record<string, string | null>) {
  const ans = answers[q.id];
  if (!ans) return 'unanswered' as const;
  return ans === q.correctOptionId ? ('correct' as const) : ('wrong' as const);
}

const PYQ_LIKE_SCORING: QuestionSessionScoring<PracticeQuestion> = { marksCorrect: 2.5, marksWrong: -0.833333, statusOf };

describe('createEmptySessionState / startSession / resetSession', () => {
  it('createEmptySessionState returns a blank session', () => {
    expect(createEmptySessionState()).toEqual({ questions: [], current: 0, answers: {}, reviewIndex: 0 });
  });

  it('startSession begins fresh regardless of any prior state', () => {
    const qs = [question('q1'), question('q2')];
    expect(startSession(qs)).toEqual({ questions: qs, current: 0, answers: {}, reviewIndex: 0 });
  });

  it('resetSession returns to the empty state', () => {
    expect(resetSession()).toEqual({ questions: [], current: 0, answers: {}, reviewIndex: 0 });
  });
});

describe('loadSessionForReview', () => {
  it('loads questions/answers directly, resetting current to 0', () => {
    const qs = [question('q1'), question('q2')];
    const answers = { q1: 'q1-correct' };
    expect(loadSessionForReview(qs, answers, 1)).toEqual({ questions: qs, current: 0, answers, reviewIndex: 1 });
  });

  it('defaults reviewIndex to 0 when omitted', () => {
    const qs = [question('q1')];
    expect(loadSessionForReview(qs, {}).reviewIndex).toBe(0);
  });
});

describe('selectAnswer / clearAnswer', () => {
  it('selectAnswer sets an answer without disturbing other answers', () => {
    const state = startSession([question('q1'), question('q2')]);
    const withQ1 = selectAnswer(state, 'q1', 'q1-correct');
    const withBoth = selectAnswer(withQ1, 'q2', 'q2-wrong');
    expect(withBoth.answers).toEqual({ q1: 'q1-correct', q2: 'q2-wrong' });
  });

  it('clearAnswer sets the answer to null, preserving other answers', () => {
    const state = selectAnswer(selectAnswer(startSession([question('q1'), question('q2')]), 'q1', 'q1-correct'), 'q2', 'q2-correct');
    const cleared = clearAnswer(state, 'q1');
    expect(cleared.answers).toEqual({ q1: null, q2: 'q2-correct' });
  });

  it('never mutates the input state', () => {
    const state = startSession([question('q1')]);
    const snapshot = JSON.stringify(state);
    selectAnswer(state, 'q1', 'q1-correct');
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe('goToNextQuestion / goToPreviousQuestion', () => {
  it('advances current by one', () => {
    const state = startSession([question('q1'), question('q2'), question('q3')]);
    expect(goToNextQuestion(state).current).toBe(1);
  });

  it('clamps at the last question', () => {
    const state = { ...startSession([question('q1'), question('q2')]), current: 1 };
    expect(goToNextQuestion(state).current).toBe(1);
  });

  it('decrements current without clamping at 0 (the caller\'s Previous button is disabled there instead)', () => {
    const state = startSession([question('q1')]);
    expect(goToPreviousQuestion(state).current).toBe(-1);
  });
});

describe('setSessionCurrent', () => {
  it('jumps current directly to the given index — Mock Test\'s always-visible navigator', () => {
    const state = startSession([question('q1'), question('q2'), question('q3')]);
    expect(setSessionCurrent(state, 2).current).toBe(2);
  });

  it('does not disturb answers, reviewIndex, or the questions list', () => {
    const state = selectAnswer(startSession([question('q1'), question('q2')]), 'q1', 'q1-correct');
    const jumped = setSessionCurrent(state, 1);
    expect(jumped.answers).toEqual(state.answers);
    expect(jumped.reviewIndex).toBe(state.reviewIndex);
    expect(jumped.questions).toBe(state.questions);
  });
});

describe('setSessionReviewIndex / reviewNextQuestion / reviewPreviousQuestion', () => {
  it('setSessionReviewIndex jumps directly to the given index', () => {
    const state = startSession([question('q1'), question('q2'), question('q3')]);
    expect(setSessionReviewIndex(state, 2).reviewIndex).toBe(2);
  });

  it('reviewNextQuestion clamps at the last question', () => {
    const state = { ...startSession([question('q1'), question('q2')]), reviewIndex: 1 };
    expect(reviewNextQuestion(state).reviewIndex).toBe(1);
  });

  it('reviewPreviousQuestion does not clamp at 0', () => {
    const state = startSession([question('q1')]);
    expect(reviewPreviousQuestion(state).reviewIndex).toBe(-1);
  });
});

describe('computeSessionResults', () => {
  it('tallies correct/wrong/unanswered and scores with the supplied marking scheme', () => {
    const qs = [question('q1'), question('q2'), question('q3'), question('q4')];
    let state = startSession(qs);
    state = selectAnswer(state, 'q1', 'q1-correct'); // correct
    state = selectAnswer(state, 'q2', 'q2-wrong'); // wrong
    state = selectAnswer(state, 'q3', 'q3-correct'); // correct
    // q4 left unanswered
    const results = computeSessionResults(state, PYQ_LIKE_SCORING);
    expect(results).toEqual({
      total: 4,
      attempted: 3,
      correct: 2,
      wrong: 1,
      unanswered: 1,
      score: 2 * 2.5 + 1 * -0.833333,
      accuracy: (2 / 3) * 100,
    });
  });

  it('returns zeroed results for an empty session', () => {
    const results = computeSessionResults(startSession([]), PYQ_LIKE_SCORING);
    expect(results).toEqual({ total: 0, attempted: 0, correct: 0, wrong: 0, unanswered: 0, score: 0, accuracy: 0 });
  });

  it('accuracy is 0 (not NaN) when nothing has been attempted', () => {
    const results = computeSessionResults(startSession([question('q1'), question('q2')]), PYQ_LIKE_SCORING);
    expect(results.attempted).toBe(0);
    expect(results.accuracy).toBe(0);
  });

  it('is parameterized by scoring — a different marking scheme yields a different score for the same answers', () => {
    let state = startSession([question('q1'), question('q2')]);
    state = selectAnswer(state, 'q1', 'q1-correct');
    state = selectAnswer(state, 'q2', 'q2-wrong');
    const altScoring: QuestionSessionScoring<PracticeQuestion> = { marksCorrect: 1, marksWrong: -1, statusOf };
    expect(computeSessionResults(state, PYQ_LIKE_SCORING).score).toBeCloseTo(2.5 - 0.833333);
    expect(computeSessionResults(state, altScoring).score).toBe(0); // +1 correct, -1 wrong
  });

  it('works with a caller-supplied statusOf that differs from the standard correct/wrong/unanswered rule', () => {
    // A scoring rule that treats a specific "trap" option as its own wrong case — proves the engine
    // never hardcodes what "correct" means, only that the caller's classifier decides it.
    const alwaysWrong: QuestionSessionScoring<PracticeQuestion> = {
      marksCorrect: 2.5,
      marksWrong: -0.833333,
      statusOf: () => 'wrong',
    };
    const state = selectAnswer(startSession([question('q1')]), 'q1', 'q1-correct');
    expect(computeSessionResults(state, alwaysWrong)).toEqual({
      total: 1,
      attempted: 1,
      correct: 0,
      wrong: 1,
      unanswered: 0,
      score: -0.833333,
      accuracy: 0,
    });
  });
});

describe('genericity beyond PracticeQuestion (Mock Test\'s synthetic Question type)', () => {
  // Mock Test's Question type (data/questionBank.ts) has a free-text `topic` field instead of a
  // `topicId` FK, so it does NOT satisfy PracticeQuestion — this fixture deliberately mirrors that
  // shape to prove the engine works for it anyway (it never reads a question's own fields).
  interface MockLikeQuestion {
    id: string;
    subject: string;
    topic: string;
    correctOptionId: string;
    options: { id: string; text: string }[];
  }

  function mockQuestion(id: string): MockLikeQuestion {
    return { id, subject: 'english', topic: 'Grammar', correctOptionId: `${id}-correct`, options: [{ id: `${id}-correct`, text: 'Right' }] };
  }

  it('drives a full session over a non-PracticeQuestion type with a blueprint-style marking scheme', () => {
    const scoring: QuestionSessionScoring<MockLikeQuestion> = {
      marksCorrect: 2.5,
      marksWrong: -(2.5 * (1 / 3)),
      statusOf: (q, answers) => {
        const ans = answers[q.id];
        if (!ans) return 'unanswered';
        return ans === q.correctOptionId ? 'correct' : 'wrong';
      },
    };
    let state = startSession([mockQuestion('m1'), mockQuestion('m2')]);
    state = selectAnswer(state, 'm1', 'm1-correct');
    state = setSessionCurrent(state, 1);
    const results = computeSessionResults(state, scoring);
    expect(results).toEqual({ total: 2, attempted: 1, correct: 1, wrong: 0, unanswered: 1, score: 2.5, accuracy: 100 });
    expect(state.current).toBe(1);
  });
});
