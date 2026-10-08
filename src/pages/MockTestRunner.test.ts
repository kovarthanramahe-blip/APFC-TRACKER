import { describe, it, expect } from 'vitest';
import { mockQuestionStatus, buildMockTestAttempt } from './MockTestRunner';
import type { CatalogQuestion } from '../lib/questionCatalog';
import type { QuestionSessionResults } from '../lib/questionSessionEngine';
import type { MockTestBlueprint } from '../lib/types';

// Mock Test hardening pass — mockQuestionStatus and buildMockTestAttempt were buried, unexported
// logic inside MockTestRunner.tsx's own handleSubmit with zero test coverage. Both were extracted
// verbatim (no calculation, rounding, negative-marking, or aggregation rule changed) purely to
// make them importable here; see MockTestRunner.tsx's own comments on each for what "verbatim"
// covers. These tests protect the EXISTING behaviour, derived directly from the current
// implementation, not from general exam-scoring assumptions.

function q(overrides: Partial<CatalogQuestion> = {}): CatalogQuestion {
  return {
    id: 'q-1',
    subject: 'polity',
    topicLabel: 'Polity',
    question: 'A question?',
    options: [
      { id: 'o1', text: 'A' },
      { id: 'o2', text: 'B' },
    ],
    correctOptionId: 'o1',
    explanation: 'Because A.',
    provenance: { kind: 'practice_bank', tag: 'Practice' },
    ...overrides,
  };
}

describe('mockQuestionStatus — existing behaviour', () => {
  it('returns "correct" when the stored answer matches correctOptionId', () => {
    expect(mockQuestionStatus(q({ correctOptionId: 'o1' }), { 'q-1': 'o1' })).toBe('correct');
  });

  it('returns "wrong" when the stored answer does not match correctOptionId', () => {
    expect(mockQuestionStatus(q({ correctOptionId: 'o1' }), { 'q-1': 'o2' })).toBe('wrong');
  });

  it('returns "unanswered" when there is no entry for the question id', () => {
    expect(mockQuestionStatus(q({ id: 'q-1' }), {})).toBe('unanswered');
  });

  it('returns "unanswered" when the stored answer is explicitly null', () => {
    expect(mockQuestionStatus(q({ id: 'q-1' }), { 'q-1': null })).toBe('unanswered');
  });

  it('only ever returns one of correct/wrong/unanswered — no other status exists', () => {
    const statuses = new Set([
      mockQuestionStatus(q({ id: 'a', correctOptionId: 'o1' }), { a: 'o1' }),
      mockQuestionStatus(q({ id: 'b', correctOptionId: 'o1' }), { b: 'o2' }),
      mockQuestionStatus(q({ id: 'c' }), {}),
    ]);
    expect(statuses).toEqual(new Set(['correct', 'wrong', 'unanswered']));
  });
});

function blueprint(overrides: Partial<MockTestBlueprint> = {}): MockTestBlueprint {
  return {
    id: 'bp-1',
    title: 'Test Blueprint',
    description: '',
    durationMinutes: 30,
    subjects: 'all',
    questionCount: 10,
    marksPerCorrect: 2.5,
    negativeMarkFraction: 1 / 3,
    ...overrides,
  };
}

function results(overrides: Partial<QuestionSessionResults> = {}): QuestionSessionResults {
  return {
    total: 0,
    attempted: 0,
    correct: 0,
    wrong: 0,
    unanswered: 0,
    score: 0,
    accuracy: 0,
    ...overrides,
  };
}

describe('buildMockTestAttempt — required attempt metadata', () => {
  it('carries id, blueprint id/title, duration, timestamps, questionIds, and answers through unchanged', () => {
    const questions = [q({ id: 'q-1' }), q({ id: 'q-2' })];
    const answers = { 'q-1': 'o1', 'q-2': 'o2' };
    const bp = blueprint({ id: 'bp-7', title: 'Full Length', durationMinutes: 120 });
    const attempt = buildMockTestAttempt(bp, questions, answers, results({ total: 2, correct: 1, wrong: 1 }), 'attempt-id-1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:30:00.000Z');

    expect(attempt.id).toBe('attempt-id-1');
    expect(attempt.blueprintId).toBe('bp-7');
    expect(attempt.blueprintTitle).toBe('Full Length');
    expect(attempt.durationMinutes).toBe(120);
    expect(attempt.startedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(attempt.submittedAt).toBe('2026-01-01T00:30:00.000Z');
    expect(attempt.questionIds).toEqual(['q-1', 'q-2']);
    expect(attempt.answers).toBe(answers);
  });

  it('carries correctCount/wrongCount/skippedCount straight from results, unchanged', () => {
    const questions = [q({ id: 'q-1' })];
    const attempt = buildMockTestAttempt(blueprint(), questions, { 'q-1': 'o1' }, results({ total: 1, correct: 3, wrong: 2, unanswered: 1 }), 'id', 'start', 'submit');
    expect(attempt.correctCount).toBe(3);
    expect(attempt.wrongCount).toBe(2);
    expect(attempt.skippedCount).toBe(1);
  });
});

describe('buildMockTestAttempt — all correct', () => {
  it('produces a subjectBreakdown with zero wrong/skipped when every question is answered correctly', () => {
    const questions = [q({ id: 'q-1', subject: 'polity', correctOptionId: 'o1' }), q({ id: 'q-2', subject: 'polity', correctOptionId: 'o1' })];
    const answers = { 'q-1': 'o1', 'q-2': 'o1' };
    const attempt = buildMockTestAttempt(blueprint(), questions, answers, results({ total: 2, correct: 2 }), 'id', 'start', 'submit');
    expect(attempt.subjectBreakdown).toEqual({ polity: { correct: 2, wrong: 0, skipped: 0, total: 2 } });
  });
});

describe('buildMockTestAttempt — all incorrect', () => {
  it('produces a subjectBreakdown with zero correct/skipped when every question is answered wrongly', () => {
    const questions = [q({ id: 'q-1', subject: 'economy', correctOptionId: 'o1' }), q({ id: 'q-2', subject: 'economy', correctOptionId: 'o1' })];
    const answers = { 'q-1': 'o2', 'q-2': 'o2' };
    const attempt = buildMockTestAttempt(blueprint(), questions, answers, results({ total: 2, wrong: 2 }), 'id', 'start', 'submit');
    expect(attempt.subjectBreakdown).toEqual({ economy: { correct: 0, wrong: 2, skipped: 0, total: 2 } });
  });
});

describe('buildMockTestAttempt — unanswered questions', () => {
  it('counts a question with no stored answer as skipped, not wrong', () => {
    const questions = [q({ id: 'q-1', subject: 'english', correctOptionId: 'o1' })];
    const attempt = buildMockTestAttempt(blueprint(), questions, {}, results({ total: 1, unanswered: 1 }), 'id', 'start', 'submit');
    expect(attempt.subjectBreakdown).toEqual({ english: { correct: 0, wrong: 0, skipped: 1, total: 1 } });
  });

  it('counts a question with an explicit null answer as skipped', () => {
    const questions = [q({ id: 'q-1', subject: 'english', correctOptionId: 'o1' })];
    const attempt = buildMockTestAttempt(blueprint(), questions, { 'q-1': null }, results({ total: 1, unanswered: 1 }), 'id', 'start', 'submit');
    expect(attempt.subjectBreakdown.english.skipped).toBe(1);
  });
});

describe('buildMockTestAttempt — mixed answers across multiple subjects', () => {
  it('produces a separate subjectBreakdown entry per subject, each correctly tallied', () => {
    const questions = [
      q({ id: 'q-1', subject: 'polity', correctOptionId: 'o1' }), // correct
      q({ id: 'q-2', subject: 'polity', correctOptionId: 'o1' }), // wrong
      q({ id: 'q-3', subject: 'economy', correctOptionId: 'o1' }), // unanswered
      q({ id: 'q-4', subject: 'economy', correctOptionId: 'o1' }), // correct
    ];
    const answers = { 'q-1': 'o1', 'q-2': 'o2', 'q-4': 'o1' };
    const attempt = buildMockTestAttempt(blueprint(), questions, answers, results({ total: 4, correct: 2, wrong: 1, unanswered: 1 }), 'id', 'start', 'submit');

    expect(attempt.subjectBreakdown).toEqual({
      polity: { correct: 1, wrong: 1, skipped: 0, total: 2 },
      economy: { correct: 1, wrong: 0, skipped: 1, total: 2 },
    });
  });
});

describe('buildMockTestAttempt — score rounding and negative marking', () => {
  it('rounds results.score to 2 decimal places, exactly as the original inline implementation did', () => {
    // 2 correct, 1 wrong at marksPerCorrect=2.5, negativeMarkFraction=1/3 — the same raw score
    // shape the shared engine (computeSessionResults) would produce for this blueprint.
    const rawScore = 2 * 2.5 - 1 * (2.5 / 3); // 4.166666666666667
    const attempt = buildMockTestAttempt(blueprint({ marksPerCorrect: 2.5, negativeMarkFraction: 1 / 3 }), [], {}, results({ total: 3, correct: 2, wrong: 1, score: rawScore }), 'id', 'start', 'submit');
    expect(attempt.score).toBe(Math.round(rawScore * 100) / 100);
    expect(attempt.score).toBe(4.17);
  });

  it('passes results.score through as-is when it already has at most 2 decimal places', () => {
    const attempt = buildMockTestAttempt(blueprint(), [], {}, results({ total: 1, correct: 1, score: 2.5 }), 'id', 'start', 'submit');
    expect(attempt.score).toBe(2.5);
  });

  it('allows a negative score when wrong answers outweigh correct ones (negative marking is not floored at 0)', () => {
    const rawScore = 1 * 2.5 - 3 * (2.5 / 3); // 1 correct, 3 wrong -> 2.5 - 2.5 = 0 exactly; use 4 wrong for a true negative
    const trulyNegative = 1 * 2.5 - 4 * (2.5 / 3); // 2.5 - 3.3333... = -0.8333...
    const attempt = buildMockTestAttempt(blueprint(), [], {}, results({ total: 5, correct: 1, wrong: 4, score: trulyNegative }), 'id', 'start', 'submit');
    expect(attempt.score).toBeLessThan(0);
    expect(attempt.score).toBe(Math.round(trulyNegative * 100) / 100);
    expect(rawScore).toBe(0); // sanity-check the boundary case referenced above
  });
});

describe('buildMockTestAttempt — maxScore', () => {
  it('is results.total multiplied by the blueprint\'s marksPerCorrect, independent of how many were actually answered', () => {
    const attempt = buildMockTestAttempt(blueprint({ marksPerCorrect: 2.5 }), [], {}, results({ total: 40, correct: 10, wrong: 5, unanswered: 25 }), 'id', 'start', 'submit');
    expect(attempt.maxScore).toBe(100);
  });

  it('uses a different blueprint\'s own marksPerCorrect, not a hardcoded value', () => {
    const attempt = buildMockTestAttempt(blueprint({ marksPerCorrect: 1 }), [], {}, results({ total: 20 }), 'id', 'start', 'submit');
    expect(attempt.maxScore).toBe(20);
  });
});
