import { describe, it, expect } from 'vitest';
import { computeAggregateAccuracy } from './mockTestStats';
import type { MockTestAttempt } from './types';

function attempt(overrides: Partial<MockTestAttempt>): MockTestAttempt {
  return {
    id: overrides.id ?? `attempt-${Math.random()}`,
    blueprintId: 'bp-1',
    blueprintTitle: 'Mock Test',
    startedAt: new Date().toISOString(),
    submittedAt: new Date().toISOString(),
    durationMinutes: 60,
    questionIds: [],
    answers: {},
    correctCount: overrides.correctCount ?? 0,
    wrongCount: overrides.wrongCount ?? 0,
    skippedCount: overrides.skippedCount ?? 0,
    score: overrides.score ?? 0,
    maxScore: overrides.maxScore ?? 0,
    subjectBreakdown: overrides.subjectBreakdown ?? {},
  };
}

describe('computeAggregateAccuracy', () => {
  it('returns 0 for zero attempts', () => {
    expect(computeAggregateAccuracy([])).toBe(0);
  });

  it('returns 0 when every attempt has zero attempted (correct+wrong) answers', () => {
    const attempts = [attempt({ correctCount: 0, wrongCount: 0, skippedCount: 20 })];
    expect(computeAggregateAccuracy(attempts)).toBe(0);
  });

  it('computes a single attempt\'s accuracy directly', () => {
    const attempts = [attempt({ correctCount: 8, wrongCount: 2 })];
    expect(computeAggregateAccuracy(attempts)).toBe(80);
  });

  it('aggregates correct/wrong counts across attempts rather than averaging percentages', () => {
    // Attempt A: 1/1 correct = 100%. Attempt B: 1/99 correct ≈ 1.01%.
    // Naive average of percentages ≈ 50.5%. Aggregate: 2 correct / 100 attempted = 2%.
    const attempts = [attempt({ correctCount: 1, wrongCount: 0 }), attempt({ correctCount: 1, wrongCount: 98 })];
    const result = computeAggregateAccuracy(attempts);
    expect(result).toBe(2);
    expect(result).not.toBeCloseTo(50.5, 0);
  });

  it('a small attempt does not get equal weight to a large attempt (regression guard for the averaging bug)', () => {
    const small = attempt({ correctCount: 5, wrongCount: 0 }); // 5/5 = 100%
    const large = attempt({ correctCount: 10, wrongCount: 90 }); // 10/100 = 10%
    const aggregate = computeAggregateAccuracy([small, large]);
    const naiveAverage = (100 + 10) / 2; // what the old (buggy) implementation would have produced
    expect(aggregate).toBe(Math.round((15 / 105) * 1000) / 10);
    expect(aggregate).not.toBe(naiveAverage);
  });

  it('ignores skippedCount entirely (only correct/wrong count toward attempted)', () => {
    const attempts = [attempt({ correctCount: 3, wrongCount: 1, skippedCount: 96 })];
    expect(computeAggregateAccuracy(attempts)).toBe(75);
  });

  it('rounds to one decimal place', () => {
    const attempts = [attempt({ correctCount: 1, wrongCount: 2 })]; // 1/3 = 33.333...%
    expect(computeAggregateAccuracy(attempts)).toBe(33.3);
  });

  it('handles many attempts summed together correctly', () => {
    const attempts = [
      attempt({ correctCount: 10, wrongCount: 10 }),
      attempt({ correctCount: 20, wrongCount: 0 }),
      attempt({ correctCount: 0, wrongCount: 10 }),
    ];
    // total correct = 30, total attempted = 50 -> 60%
    expect(computeAggregateAccuracy(attempts)).toBe(60);
  });
});
