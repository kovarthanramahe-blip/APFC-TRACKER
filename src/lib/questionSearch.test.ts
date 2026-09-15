import { describe, it, expect } from 'vitest';
import type { CatalogQuestion } from './questionCatalog';
import { matchesQuestionSearch } from './questionSearch';

function entry(overrides: Partial<CatalogQuestion> = {}): CatalogQuestion {
  return {
    id: 'q-1',
    subject: 'labourLaw',
    topicLabel: 'Employees’ Provident Funds & MP Act, 1952',
    question: 'What is the statutory wage ceiling under the EPF & MP Act, 1952?',
    options: [
      { id: 'o0', text: '₹15,000' },
      { id: 'o1', text: '₹21,000' },
    ],
    correctOptionId: 'o0',
    explanation: 'Because ₹15,000 is the statutory ceiling.',
    provenance: { kind: 'practice_bank', tag: 'Practice' },
    ...overrides,
  };
}

describe('matchesQuestionSearch', () => {
  it('matches everything when the query is empty', () => {
    expect(matchesQuestionSearch(entry(), '')).toBe(true);
  });

  it('matches everything when the query is whitespace-only', () => {
    expect(matchesQuestionSearch(entry(), '   ')).toBe(true);
  });

  it('matches a keyword found in the question text', () => {
    expect(matchesQuestionSearch(entry(), 'wage ceiling')).toBe(true);
  });

  it('matches a keyword found in the topic label', () => {
    expect(matchesQuestionSearch(entry(), 'Provident Funds')).toBe(true);
  });

  it('matches a keyword found only in an option text', () => {
    expect(matchesQuestionSearch(entry(), '21,000')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(matchesQuestionSearch(entry(), 'WAGE CEILING')).toBe(true);
    expect(matchesQuestionSearch(entry(), 'epf & mp act')).toBe(true);
  });

  it('is whitespace-tolerant (leading/trailing spaces trimmed)', () => {
    expect(matchesQuestionSearch(entry(), '  wage ceiling  ')).toBe(true);
  });

  it('does not match a keyword absent from question, topic, and options', () => {
    expect(matchesQuestionSearch(entry(), 'gratuity')).toBe(false);
  });

  it('never mutates the input entry', () => {
    const e = entry();
    const snapshot = JSON.stringify(e);
    matchesQuestionSearch(e, 'wage');
    expect(JSON.stringify(e)).toBe(snapshot);
  });
});
