import { describe, it, expect } from 'vitest';
import { buildStudyHistoryEvents, filterEventsByRange, groupEventsByDate, computeStudyHistoryAnalytics, type BuildStudyHistoryInput } from './studyHistory';
import type { PomodoroSession, PYQAttempt, MockTestAttempt } from './types';
import type { RevisionQueue } from './revisionQueue';

function session(overrides: Partial<PomodoroSession> & { id: string }): PomodoroSession {
  return { mode: 'focus', subject: 'general', startedAt: '2026-09-20T09:00:00.000Z', completedAt: '2026-09-20T09:25:00.000Z', durationMinutes: 25, completedFully: true, ...overrides };
}

function pyqAttempt(overrides: Partial<PYQAttempt> & { id: string }): PYQAttempt {
  return {
    submittedAt: '2026-09-20T10:00:00.000Z',
    year: 'all',
    subject: 'all',
    topicId: 'all',
    questionIds: ['q1', 'q2'],
    answers: {},
    correctCount: 1,
    wrongCount: 1,
    unansweredCount: 0,
    score: 1,
    accuracy: 50,
    ...overrides,
  };
}

function mockTestAttempt(overrides: Partial<MockTestAttempt> & { id: string }): MockTestAttempt {
  return {
    blueprintId: 'bp1',
    blueprintTitle: 'Full Mock 1',
    startedAt: '2026-09-20T08:00:00.000Z',
    submittedAt: '2026-09-20T09:00:00.000Z',
    durationMinutes: 60,
    questionIds: [],
    answers: {},
    correctCount: 10,
    wrongCount: 2,
    skippedCount: 0,
    score: 10,
    maxScore: 12,
    subjectBreakdown: {},
    ...overrides,
  };
}

const EMPTY_INPUT: BuildStudyHistoryInput = { sessions: [], pyqAttempts: [], mockTestAttempts: [], planTasks: [], personalTasks: [], revisionQueue: {} };

describe('buildStudyHistoryEvents', () => {
  it('returns an empty list when nothing has ever been recorded', () => {
    expect(buildStudyHistoryEvents(EMPTY_INPUT)).toEqual([]);
  });

  it('builds a focus_session event dated by completedAt, with minutes only for focus mode', () => {
    const events = buildStudyHistoryEvents({ ...EMPTY_INPUT, sessions: [session({ id: 's1' }), session({ id: 's2', mode: 'shortBreak' })] });
    const focus = events.find((e) => e.id === 'session:s1');
    const brk = events.find((e) => e.id === 'session:s2');
    expect(focus).toMatchObject({ kind: 'focus_session', date: '2026-09-20', minutes: 25 });
    expect(brk?.minutes).toBeUndefined();
  });

  it('builds a pyq_attempt event dated by submittedAt', () => {
    const events = buildStudyHistoryEvents({ ...EMPTY_INPUT, pyqAttempts: [pyqAttempt({ id: 'p1' })] });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: 'pyq:p1', kind: 'pyq_attempt', date: '2026-09-20' });
  });

  it('builds a mock_test event dated by submittedAt, titled by the blueprint', () => {
    const events = buildStudyHistoryEvents({ ...EMPTY_INPUT, mockTestAttempts: [mockTestAttempt({ id: 'm1' })] });
    expect(events[0]).toMatchObject({ id: 'mock:m1', kind: 'mock_test', title: 'Full Mock 1', date: '2026-09-20' });
  });

  it('includes only COMPLETED tasks, dated by their own scheduled date (never a fabricated timestamp)', () => {
    const planTasks = [
      { id: 't1', date: '2026-09-18', topicId: 'x', subjectId: 'y', phase: 'coverage' as const, taskType: 'coverage' as const, title: 'Coverage task', estimatedMinutes: 40, priority: 1, status: 'completed' as const, reason: 'r' },
      { id: 't2', date: '2026-09-19', topicId: 'x', subjectId: 'y', phase: 'coverage' as const, taskType: 'coverage' as const, title: 'Still pending', estimatedMinutes: 40, priority: 2, status: 'pending' as const, reason: 'r' },
    ];
    const events = buildStudyHistoryEvents({ ...EMPTY_INPUT, planTasks });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: 'task:t1', date: '2026-09-18', minutes: 40 });
  });

  it('includes a revision_review event only when reviewCount > 0 (never a bookmarked-but-unreviewed item)', () => {
    const revisionQueue: RevisionQueue = {
      reviewed: { pyqId: 'reviewed', box: 2, dueDate: '2026-09-25', lastReviewedDate: '2026-09-20', reviewCount: 1 },
      untouched: { pyqId: 'untouched', box: 1, dueDate: '2026-09-20', lastReviewedDate: null, reviewCount: 0 },
    };
    const events = buildStudyHistoryEvents({ ...EMPTY_INPUT, revisionQueue });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: 'revision:reviewed', date: '2026-09-20' });
  });

  it('sorts newest date first', () => {
    const events = buildStudyHistoryEvents({
      ...EMPTY_INPUT,
      sessions: [session({ id: 'old', completedAt: '2026-09-18T09:00:00.000Z' }), session({ id: 'new', completedAt: '2026-09-22T09:00:00.000Z' })],
    });
    expect(events.map((e) => e.id)).toEqual(['session:new', 'session:old']);
  });
});

describe('filterEventsByRange', () => {
  it('keeps only events within [start, end] inclusive', () => {
    const events = buildStudyHistoryEvents({
      ...EMPTY_INPUT,
      sessions: [session({ id: 'a', completedAt: '2026-09-15T09:00:00.000Z' }), session({ id: 'b', completedAt: '2026-09-20T09:00:00.000Z' }), session({ id: 'c', completedAt: '2026-09-25T09:00:00.000Z' })],
    });
    const filtered = filterEventsByRange(events, '2026-09-18', '2026-09-22');
    expect(filtered.map((e) => e.id)).toEqual(['session:b']);
  });
});

describe('groupEventsByDate', () => {
  it('groups by date, newest date first, preserving each date\'s own event list', () => {
    const events = buildStudyHistoryEvents({
      ...EMPTY_INPUT,
      sessions: [session({ id: 'a', completedAt: '2026-09-18T09:00:00.000Z' })],
      pyqAttempts: [pyqAttempt({ id: 'p1', submittedAt: '2026-09-18T10:00:00.000Z' }), pyqAttempt({ id: 'p2', submittedAt: '2026-09-20T10:00:00.000Z' })],
    });
    const grouped = groupEventsByDate(events);
    expect(grouped.map(([date]) => date)).toEqual(['2026-09-20', '2026-09-18']);
    expect(grouped[1][1]).toHaveLength(2);
  });

  it('returns an empty array for no events', () => {
    expect(groupEventsByDate([])).toEqual([]);
  });
});

describe('computeStudyHistoryAnalytics', () => {
  it('zeroes everything for no activity at all, never dividing by zero or throwing', () => {
    const snapshot = computeStudyHistoryAnalytics([], {}, '2026-09-22');
    expect(snapshot.totalFocusMinutes).toBe(0);
    expect(snapshot.focusSessionCount).toBe(0);
    expect(snapshot.streak).toEqual({ current: 0, best: 0 });
    expect(snapshot.dailyActivity).toHaveLength(7);
    expect(snapshot.eventCountByKind).toEqual({ focus_session: 0, pyq_attempt: 0, mock_test: 0, task_completed: 0, revision_review: 0 });
  });

  it('counts focusSessionCount only from focus_session events that actually carry minutes', () => {
    const events = buildStudyHistoryEvents({ ...EMPTY_INPUT, sessions: [session({ id: 'a' }), session({ id: 'b', mode: 'longBreak' })] });
    const snapshot = computeStudyHistoryAnalytics(events, {}, '2026-09-22');
    expect(snapshot.focusSessionCount).toBe(1);
    expect(snapshot.eventCountByKind.focus_session).toBe(2);
  });

  it('reuses lib/gamification totalFocusMinutes/computeStreaks verbatim against a real studyLog', () => {
    const studyLog = { '2026-09-22': { date: '2026-09-22', focusMinutes: 50, topicsCompleted: 1, testsCompleted: 0 } };
    const snapshot = computeStudyHistoryAnalytics([], studyLog, '2026-09-22');
    expect(snapshot.totalFocusMinutes).toBe(50);
    expect(snapshot.streak.current).toBeGreaterThanOrEqual(0);
  });
});
