import { describe, it, expect } from 'vitest';
import { computeSyllabusOverview, computeSyllabusOverviewBySubject } from './syllabusOS';
import type { UnifiedTopicStatus, TopicStatus } from './topicStatus';

function status(overrides: Partial<UnifiedTopicStatus> & { status: TopicStatus }): UnifiedTopicStatus {
  return {
    topicId: 't1',
    topicTitle: 'Topic',
    subjectId: 's1',
    subjectTitle: 'Subject',
    covered: false,
    pyqAttempted: 0,
    pyqAccuracy: null,
    ...overrides,
  };
}

describe('computeSyllabusOverview', () => {
  it('returns all zeros and 0% for an empty syllabus, never divides by zero', () => {
    const overview = computeSyllabusOverview([]);
    expect(overview).toEqual({ totalTopics: 0, completedCount: 0, remainingCount: 0, weakCount: 0, completionPct: 0 });
  });

  it('counts needs_practice/needs_revision/strong as completed, not_started/needs_coverage as remaining', () => {
    const statuses = [
      status({ topicId: 't1', status: 'not_started' }),
      status({ topicId: 't2', status: 'needs_coverage' }),
      status({ topicId: 't3', status: 'needs_practice' }),
      status({ topicId: 't4', status: 'needs_revision' }),
      status({ topicId: 't5', status: 'strong' }),
    ];
    const overview = computeSyllabusOverview(statuses);
    expect(overview.totalTopics).toBe(5);
    expect(overview.completedCount).toBe(3);
    expect(overview.remainingCount).toBe(2);
    expect(overview.completionPct).toBe(60);
  });

  it('counts weakCount as a SUBSET of completedCount, never added on top', () => {
    const statuses = [status({ topicId: 't1', status: 'needs_revision' }), status({ topicId: 't2', status: 'strong' })];
    const overview = computeSyllabusOverview(statuses);
    expect(overview.completedCount).toBe(2);
    expect(overview.weakCount).toBe(1);
    expect(overview.weakCount).toBeLessThanOrEqual(overview.completedCount);
  });

  it('rounds completionPct to the nearest whole percent', () => {
    const statuses = [
      status({ topicId: 't1', status: 'strong' }),
      status({ topicId: 't2', status: 'not_started' }),
      status({ topicId: 't3', status: 'not_started' }),
    ];
    // 1/3 = 33.33...% -> rounds to 33
    expect(computeSyllabusOverview(statuses).completionPct).toBe(33);
  });
});

describe('computeSyllabusOverviewBySubject', () => {
  it('groups by subjectId and computes an independent overview per subject', () => {
    const statuses = [
      status({ topicId: 't1', subjectId: 's1', subjectTitle: 'English', status: 'strong' }),
      status({ topicId: 't2', subjectId: 's1', subjectTitle: 'English', status: 'not_started' }),
      status({ topicId: 't3', subjectId: 's2', subjectTitle: 'Polity', status: 'needs_revision' }),
    ];
    const bySubject = computeSyllabusOverviewBySubject(statuses);
    expect(bySubject).toHaveLength(2);
    const english = bySubject.find((s) => s.subjectId === 's1');
    const polity = bySubject.find((s) => s.subjectId === 's2');
    expect(english).toMatchObject({ subjectTitle: 'English', totalTopics: 2, completedCount: 1, remainingCount: 1 });
    expect(polity).toMatchObject({ subjectTitle: 'Polity', totalTopics: 1, completedCount: 1, weakCount: 1 });
  });

  it('returns an empty array for an empty syllabus', () => {
    expect(computeSyllabusOverviewBySubject([])).toEqual([]);
  });
});
