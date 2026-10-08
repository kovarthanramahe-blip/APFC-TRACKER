import { describe, it, expect } from 'vitest';
import { bucketRevisionDueDates, computeApfcHomeSnapshot, type ApfcHomeData } from './commandCentreHome';
import type { RevisionQueue } from './revisionQueue';
import { PYQ_BANK } from '../data/pyq';

const TODAY = '2026-09-22';

function queueItem(dueDate: string) {
  return { box: 1, dueDate, lastReviewedDate: '2026-09-10', reviewCount: 1 };
}

describe('bucketRevisionDueDates', () => {
  it('buckets eligible PYQs into overdue, dueToday, dueTomorrow, dueThisWeek', () => {
    const ids = PYQ_BANK.slice(0, 5).map((q) => q.id);
    const queue: RevisionQueue = {
      [ids[0]]: { pyqId: ids[0], ...queueItem('2026-09-20') }, // overdue (2 days before today)
      [ids[1]]: { pyqId: ids[1], ...queueItem('2026-09-22') }, // today
      [ids[2]]: { pyqId: ids[2], ...queueItem('2026-09-23') }, // tomorrow
      [ids[3]]: { pyqId: ids[3], ...queueItem('2026-09-26') }, // this week (4 days out)
      [ids[4]]: { pyqId: ids[4], ...queueItem('2026-10-15') }, // beyond a week — not counted
    };
    const buckets = bucketRevisionDueDates(queue, [], ids, TODAY);
    expect(buckets).toEqual({ overdue: 1, dueToday: 1, dueTomorrow: 1, dueThisWeek: 1 });
  });

  it('treats an untracked (never-seen) eligible id as due today, never dropped', () => {
    const id = PYQ_BANK[0].id;
    const buckets = bucketRevisionDueDates({}, [], [id], TODAY);
    expect(buckets).toEqual({ overdue: 0, dueToday: 1, dueTomorrow: 0, dueThisWeek: 0 });
  });

  it('counts nothing when no PYQ is bookmarked or ever answered incorrectly', () => {
    const buckets = bucketRevisionDueDates({}, [], [], TODAY);
    expect(buckets).toEqual({ overdue: 0, dueToday: 0, dueTomorrow: 0, dueThisWeek: 0 });
  });

  it('exactly a week out (day 7) still counts as dueThisWeek, day 8 does not', () => {
    const ids = PYQ_BANK.slice(0, 2).map((q) => q.id);
    const queue: RevisionQueue = {
      [ids[0]]: { pyqId: ids[0], ...queueItem('2026-09-29') }, // today + 7
      [ids[1]]: { pyqId: ids[1], ...queueItem('2026-09-30') }, // today + 8
    };
    const buckets = bucketRevisionDueDates(queue, [], ids, TODAY);
    expect(buckets.dueThisWeek).toBe(1);
  });
});

function baseApfcHomeData(overrides: Partial<ApfcHomeData> = {}): ApfcHomeData {
  return {
    completedTopics: {},
    pyqAttempts: [],
    bookmarkedPyqIds: [],
    revisionQueue: {},
    attempts: [],
    sessions: [],
    studyLog: {},
    starredQuestionIds: [],
    studyPlan: null,
    personalStudyPlanTasks: [],
    dailyGoalMinutes: 60,
    ...overrides,
  };
}

describe('computeApfcHomeSnapshot', () => {
  it('reports 0% syllabus completion and an empty activity trend for a brand-new user', () => {
    const snapshot = computeApfcHomeSnapshot(baseApfcHomeData(), TODAY);
    expect(snapshot.overallSyllabusPct).toBe(0);
    expect(snapshot.todayFocusMinutes).toBe(0);
    expect(snapshot.dailyQueue.status).toBe('no_plan');
    expect(snapshot.gamification.xp).toBe(0);
    expect(snapshot.activityTrend).toHaveLength(7);
    expect(snapshot.revisionBuckets).toEqual({ overdue: 0, dueToday: 0, dueTomorrow: 0, dueThisWeek: 0 });
  });

  it('reads todayFocusMinutes from studyLog for the supplied today date, never a different date', () => {
    const snapshot = computeApfcHomeSnapshot(
      baseApfcHomeData({ studyLog: { [TODAY]: { date: TODAY, focusMinutes: 45, topicsCompleted: 1, testsCompleted: 0 }, '2026-09-21': { date: '2026-09-21', focusMinutes: 999, topicsCompleted: 0, testsCompleted: 0 } } }),
      TODAY,
    );
    expect(snapshot.todayFocusMinutes).toBe(45);
  });

  it('passes dailyGoalMinutes straight through unchanged', () => {
    const snapshot = computeApfcHomeSnapshot(baseApfcHomeData({ dailyGoalMinutes: 90 }), TODAY);
    expect(snapshot.dailyGoalMinutes).toBe(90);
  });
});
