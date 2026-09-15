import { describe, it, expect } from 'vitest';
import { classifyMockAnswerStatus, matchesMockReviewFilter, MOCK_REVIEW_FILTERS } from './mockTestReview';

describe('classifyMockAnswerStatus', () => {
  it('is "unanswered" for a null userAnswer', () => {
    expect(classifyMockAnswerStatus(null, 'o0')).toBe('unanswered');
  });

  it('is "unanswered" for an undefined userAnswer', () => {
    expect(classifyMockAnswerStatus(undefined, 'o0')).toBe('unanswered');
  });

  it('is "correct" when userAnswer matches correctOptionId', () => {
    expect(classifyMockAnswerStatus('o0', 'o0')).toBe('correct');
  });

  it('is "wrong" when userAnswer does not match correctOptionId', () => {
    expect(classifyMockAnswerStatus('o1', 'o0')).toBe('wrong');
  });
});

describe('matchesMockReviewFilter', () => {
  it('"all" matches every status', () => {
    expect(matchesMockReviewFilter('correct', 'all')).toBe(true);
    expect(matchesMockReviewFilter('wrong', 'all')).toBe(true);
    expect(matchesMockReviewFilter('unanswered', 'all')).toBe(true);
  });

  it('a specific filter matches only its own status', () => {
    expect(matchesMockReviewFilter('wrong', 'wrong')).toBe(true);
    expect(matchesMockReviewFilter('correct', 'wrong')).toBe(false);
    expect(matchesMockReviewFilter('unanswered', 'wrong')).toBe(false);
  });

  it('MOCK_REVIEW_FILTERS lists exactly all/correct/wrong/unanswered', () => {
    expect([...MOCK_REVIEW_FILTERS].sort()).toEqual(['all', 'correct', 'unanswered', 'wrong']);
  });
});
