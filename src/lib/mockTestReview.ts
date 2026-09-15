// Mock Test Result answer-review filtering (pages/MockTestResult.tsx). A full-length mock test can
// run to 100 questions, and "Answer Review" listed every one of them with no way to jump straight
// to just the wrong/skipped ones — the single most useful thing to revisit after a mock test.
// Pure and deterministic: reuses lib/questionSessionEngine.ts's own QuestionResultStatus vocabulary
// ('correct' | 'wrong' | 'unanswered') rather than inventing new terms, and derives status purely
// from data MockTestAttempt already persists (answers + each question's correctOptionId) — no
// change to MockTestAttempt or any other persisted shape.
import type { QuestionResultStatus } from './questionSessionEngine';

/** Same rule MockTestRunner.tsx's own mockQuestionStatus already applies, expressed for a single
 * (userAnswer, correctOptionId) pair rather than a CatalogQuestion — MockTestResult.tsx works
 * directly off QUESTION_BANK's own Question type, not the catalog. */
export function classifyMockAnswerStatus(userAnswer: string | null | undefined, correctOptionId: string): QuestionResultStatus {
  if (!userAnswer) return 'unanswered';
  return userAnswer === correctOptionId ? 'correct' : 'wrong';
}

export type MockReviewFilter = 'all' | QuestionResultStatus;

export const MOCK_REVIEW_FILTERS: readonly MockReviewFilter[] = ['all', 'wrong', 'unanswered', 'correct'];

export function matchesMockReviewFilter(status: QuestionResultStatus, filter: MockReviewFilter): boolean {
  return filter === 'all' || filter === status;
}
