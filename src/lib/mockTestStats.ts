import type { MockTestAttempt } from './types';

/**
 * Aggregate accuracy across all mock-test attempts: total correct answers divided by total
 * attempted answers (correct + wrong), as a percentage. This is deliberately NOT an average of
 * each attempt's own accuracy percentage — averaging per-attempt percentages gives a 5-question
 * attempt the same weight as a 100-question attempt, which misrepresents overall accuracy.
 * Mirrors the aggregate-count methodology already used for PYQ performance (see
 * PYQTest.tsx's `performance` memo).
 */
export function computeAggregateAccuracy(attempts: MockTestAttempt[]): number {
  const totalCorrect = attempts.reduce((sum, a) => sum + a.correctCount, 0);
  const totalAttempted = attempts.reduce((sum, a) => sum + a.correctCount + a.wrongCount, 0);
  if (totalAttempted === 0) return 0;
  return Math.round((totalCorrect / totalAttempted) * 1000) / 10;
}
