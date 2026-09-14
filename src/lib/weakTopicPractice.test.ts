import { describe, it, expect } from 'vitest';
import type { PYQ } from './types';
import type { TopicStatus, UnifiedTopicStatus } from './topicStatus';
import { WEAK_TOPIC_STATUSES, DEFAULT_WEAK_TOPIC_PRACTICE_CAP, selectWeakTopics, selectWeakTopicPracticeIds } from './weakTopicPractice';

function status(topicId: string, statusValue: TopicStatus, overrides: Partial<UnifiedTopicStatus> = {}): UnifiedTopicStatus {
  return {
    topicId,
    topicTitle: overrides.topicTitle ?? topicId,
    subjectId: overrides.subjectId ?? 'subj-1',
    subjectTitle: overrides.subjectTitle ?? 'Subject',
    covered: overrides.covered ?? true,
    pyqAttempted: overrides.pyqAttempted ?? 0,
    pyqAccuracy: overrides.pyqAccuracy ?? null,
    status: statusValue,
  };
}

function pyq(id: string, topicId: string): PYQ {
  return {
    id,
    year: 2023,
    subject: 'polity',
    topicId,
    question: `Question ${id}`,
    options: [
      { id: `${id}-o0`, text: 'Option A' },
      { id: `${id}-o1`, text: 'Option B' },
    ],
    correctOptionId: `${id}-o0`,
    explanation: `Explanation for ${id}`,
    verificationStatus: 'cross_verified',
  };
}

describe('selectWeakTopics', () => {
  it('keeps only needs_revision/needs_coverage/needs_practice topics', () => {
    const statuses = [
      status('t-strong', 'strong'),
      status('t-not-started', 'not_started'),
      status('t-revision', 'needs_revision'),
      status('t-coverage', 'needs_coverage'),
      status('t-practice', 'needs_practice'),
    ];
    const weak = selectWeakTopics(statuses);
    expect(weak.map((s) => s.topicId).sort()).toEqual(['t-coverage', 't-practice', 't-revision']);
    expect(WEAK_TOPIC_STATUSES).toEqual(['needs_revision', 'needs_coverage', 'needs_practice']);
  });

  it('does not mutate the input array', () => {
    const statuses = [status('t1', 'needs_revision'), status('t2', 'strong')];
    const snapshot = JSON.stringify(statuses);
    selectWeakTopics(statuses);
    expect(JSON.stringify(statuses)).toBe(snapshot);
  });
});

describe('selectWeakTopicPracticeIds — status prioritization', () => {
  it('orders topics by urgency: needs_revision, then needs_coverage, then needs_practice', () => {
    const statuses = [
      status('t-practice', 'needs_practice'),
      status('t-coverage', 'needs_coverage'),
      status('t-revision', 'needs_revision'),
    ];
    const bank = [pyq('q-practice', 't-practice'), pyq('q-coverage', 't-coverage'), pyq('q-revision', 't-revision')];
    const ids = selectWeakTopicPracticeIds(statuses, bank);
    expect(ids).toEqual(['q-revision', 'q-coverage', 'q-practice']);
  });
});

describe('selectWeakTopicPracticeIds — deterministic tie-breaking', () => {
  it('breaks ties within the same status by weaker accuracy first', () => {
    const statuses = [
      status('t-a', 'needs_revision', { pyqAccuracy: 50 }),
      status('t-b', 'needs_revision', { pyqAccuracy: 20 }),
    ];
    const bank = [pyq('q-a', 't-a'), pyq('q-b', 't-b')];
    const ids = selectWeakTopicPracticeIds(statuses, bank);
    expect(ids).toEqual(['q-b', 'q-a']);
  });

  it('falls back to alphabetical topic title when status and accuracy tie', () => {
    const statuses = [
      status('t-zebra', 'needs_coverage', { topicTitle: 'Zebra Topic' }),
      status('t-alpha', 'needs_coverage', { topicTitle: 'Alpha Topic' }),
    ];
    const bank = [pyq('q-zebra', 't-zebra'), pyq('q-alpha', 't-alpha')];
    const ids = selectWeakTopicPracticeIds(statuses, bank);
    expect(ids).toEqual(['q-alpha', 'q-zebra']);
  });
});

describe('selectWeakTopicPracticeIds — cap behavior', () => {
  it('truncates to the given cap, keeping the most urgent topics first', () => {
    const statuses = [status('t-revision', 'needs_revision'), status('t-coverage', 'needs_coverage')];
    const bank = [
      pyq('q-rev-1', 't-revision'),
      pyq('q-rev-2', 't-revision'),
      pyq('q-cov-1', 't-coverage'),
      pyq('q-cov-2', 't-coverage'),
    ];
    const ids = selectWeakTopicPracticeIds(statuses, bank, 3);
    expect(ids).toEqual(['q-rev-1', 'q-rev-2', 'q-cov-1']);
  });

  it('returns everything available when cap exceeds the eligible count (no padding)', () => {
    const statuses = [status('t1', 'needs_revision')];
    const bank = [pyq('q1', 't1'), pyq('q2', 't1')];
    const ids = selectWeakTopicPracticeIds(statuses, bank, 50);
    expect(ids).toEqual(['q1', 'q2']);
  });

  it('returns an empty list for a zero or negative cap', () => {
    const statuses = [status('t1', 'needs_revision')];
    const bank = [pyq('q1', 't1')];
    expect(selectWeakTopicPracticeIds(statuses, bank, 0)).toEqual([]);
    expect(selectWeakTopicPracticeIds(statuses, bank, -5)).toEqual([]);
  });

  it('applies DEFAULT_WEAK_TOPIC_PRACTICE_CAP when no cap is given', () => {
    const statuses = [status('t1', 'needs_revision')];
    const bank = Array.from({ length: 30 }, (_, i) => pyq(`q${i}`, 't1'));
    const ids = selectWeakTopicPracticeIds(statuses, bank);
    expect(ids).toHaveLength(DEFAULT_WEAK_TOPIC_PRACTICE_CAP);
    expect(ids).toEqual(bank.slice(0, DEFAULT_WEAK_TOPIC_PRACTICE_CAP).map((p) => p.id));
  });
});

describe('selectWeakTopicPracticeIds — no duplicate ids', () => {
  it('de-duplicates a PYQ id that appears more than once in the bank', () => {
    const statuses = [status('t1', 'needs_revision')];
    const bank = [pyq('q1', 't1'), pyq('q1', 't1'), pyq('q2', 't1')];
    const ids = selectWeakTopicPracticeIds(statuses, bank);
    expect(ids).toEqual(['q1', 'q2']);
  });
});

describe('selectWeakTopicPracticeIds — filtering to weak topics', () => {
  it('excludes PYQs belonging to strong or not_started topics', () => {
    const statuses = [status('t-weak', 'needs_revision'), status('t-strong', 'strong'), status('t-fresh', 'not_started')];
    const bank = [pyq('q-weak', 't-weak'), pyq('q-strong', 't-strong'), pyq('q-fresh', 't-fresh')];
    const ids = selectWeakTopicPracticeIds(statuses, bank);
    expect(ids).toEqual(['q-weak']);
  });

  it('ignores PYQs whose topicId has no corresponding status entry at all', () => {
    const statuses = [status('t-weak', 'needs_revision')];
    const bank = [pyq('q-weak', 't-weak'), pyq('q-orphan', 't-unknown')];
    const ids = selectWeakTopicPracticeIds(statuses, bank);
    expect(ids).toEqual(['q-weak']);
  });
});

describe('selectWeakTopicPracticeIds — no weak topics', () => {
  it('returns an empty list when every topic is strong or not_started', () => {
    const statuses = [status('t1', 'strong'), status('t2', 'not_started')];
    const bank = [pyq('q1', 't1'), pyq('q2', 't2')];
    expect(selectWeakTopicPracticeIds(statuses, bank)).toEqual([]);
  });

  it('returns an empty list for an empty statuses array', () => {
    expect(selectWeakTopicPracticeIds([], [pyq('q1', 't1')])).toEqual([]);
  });
});

describe('selectWeakTopicPracticeIds — weak topics with no matching PYQs', () => {
  it('returns an empty list when the bank has no questions for the weak topics', () => {
    const statuses = [status('t-weak', 'needs_revision')];
    const bank = [pyq('q-other', 't-other')];
    expect(selectWeakTopicPracticeIds(statuses, bank)).toEqual([]);
  });

  it('returns an empty list for an empty bank', () => {
    const statuses = [status('t-weak', 'needs_revision')];
    expect(selectWeakTopicPracticeIds(statuses, [])).toEqual([]);
  });
});

describe('selectWeakTopicPracticeIds — immutability and determinism', () => {
  it('never mutates the statuses or bank inputs', () => {
    const statuses = [status('t1', 'needs_revision'), status('t2', 'needs_coverage')];
    const bank = [pyq('q1', 't1'), pyq('q2', 't2')];
    const statusesSnapshot = JSON.stringify(statuses);
    const bankSnapshot = JSON.stringify(bank);
    selectWeakTopicPracticeIds(statuses, bank, 1);
    expect(JSON.stringify(statuses)).toBe(statusesSnapshot);
    expect(JSON.stringify(bank)).toBe(bankSnapshot);
  });

  it('produces the same result across repeated calls with identical inputs', () => {
    const statuses = [
      status('t1', 'needs_revision', { pyqAccuracy: 30 }),
      status('t2', 'needs_coverage'),
      status('t3', 'needs_practice'),
    ];
    const bank = [pyq('q1', 't1'), pyq('q2', 't2'), pyq('q3', 't3')];
    const first = selectWeakTopicPracticeIds(statuses, bank, 2);
    const second = selectWeakTopicPracticeIds(statuses, bank, 2);
    expect(second).toEqual(first);
  });
});
