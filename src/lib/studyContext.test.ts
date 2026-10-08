import { describe, it, expect } from 'vitest';
import { computeStudyContext } from './studyContext';
import type { ApfcHomeSnapshot } from './commandCentreHome';
import type { RevisionQueue } from './revisionQueue';
import type { PomodoroSession } from './types';
import type { DailyQueueResult } from './studyPlanDailyQueue';

const TODAY = '2026-09-22';

function session(overrides: Partial<PomodoroSession> & { id: string }): PomodoroSession {
  return { mode: 'focus', subject: 'general', startedAt: `${TODAY}T09:00:00.000Z`, completedAt: `${TODAY}T09:25:00.000Z`, durationMinutes: 25, completedFully: true, ...overrides };
}

function homeSnapshot(overrides: Partial<ApfcHomeSnapshot> = {}): ApfcHomeSnapshot {
  const noPlan: DailyQueueResult = { status: 'no_plan', currentDate: TODAY };
  return {
    overallSyllabusPct: 10,
    dailyQueue: noPlan,
    todayFocusMinutes: 0,
    dailyGoalMinutes: 60,
    gamification: { xp: 0, level: { level: 1, xp: 0, xpIntoLevel: 0, xpForNextLevel: 100, xpToNext: 100, progressPct: 0 }, streaks: { current: 0, best: 0 }, earnedBadges: [], nextBadge: null },
    rewards: { context: {} as never, unlocked: [], locked: [], currentTitle: null, nextReward: null },
    revisionBuckets: { overdue: 0, dueToday: 0, dueTomorrow: 0, dueThisWeek: 0 },
    activityTrend: [],
    ...overrides,
  };
}

describe('computeStudyContext', () => {
  it('zeroes everything for a brand-new user (no plan, no revision, no sessions)', () => {
    const ctx = computeStudyContext({ today: TODAY, apfcHome: homeSnapshot(), revisionQueue: {}, sessions: [], syllabusWeakCount: 0 });
    expect(ctx.planner).toEqual({ hasPlan: false, todayPending: 0, todayCompleted: 0, overdueCount: 0, nextTaskTitle: null, nextTaskReason: null });
    expect(ctx.revision).toEqual({ dueNow: 0, dueTomorrow: 0, dueThisWeek: 0, reviewedToday: 0, masteredCount: 0 });
    expect(ctx.focus.todaySessionCount).toBe(0);
  });

  it('reads planner today/overdue/next-task straight from an active daily queue, never recomputing', () => {
    const activeQueue: DailyQueueResult = {
      status: 'active',
      currentDate: TODAY,
      todayState: 'pending',
      isStudyDay: true,
      capacity: { configuredMinutes: 60, plannedMinutes: 30, completedMinutes: 0, remainingMinutes: 30, utilizationPct: 50, overCapacity: false },
      todayPending: [],
      todayCompletedCount: 1,
      overdueTasks: [],
      nextUp: [],
      recommendedOrder: [
        {
          id: 'study_plan:a',
          source: 'study_plan',
          task: { id: 'a', date: TODAY, topicId: 't', subjectId: 's', phase: 'coverage', taskType: 'coverage', title: 'Reading Comprehension', estimatedMinutes: 30, priority: 1, status: 'pending', reason: 'r' },
          priority: 1,
          reason: 'Needs syllabus coverage',
          overdue: false,
          estimatedMinutes: 30,
        },
      ],
    };
    const ctx = computeStudyContext({ today: TODAY, apfcHome: homeSnapshot({ dailyQueue: activeQueue }), revisionQueue: {}, sessions: [], syllabusWeakCount: 0 });
    expect(ctx.planner.hasPlan).toBe(true);
    expect(ctx.planner.todayCompleted).toBe(1);
    expect(ctx.planner.nextTaskTitle).toBe('Reading Comprehension');
    expect(ctx.planner.nextTaskReason).toBe('Needs syllabus coverage');
  });

  it('counts reviewedToday and masteredCount directly off the raw revisionQueue, never a second scheduling calc', () => {
    const revisionQueue: RevisionQueue = {
      q1: { pyqId: 'q1', box: 6, dueDate: '2026-10-15', lastReviewedDate: TODAY, reviewCount: 3 }, // reviewed today + mastered (MAX_BOX=6)
      q2: { pyqId: 'q2', box: 2, dueDate: '2026-09-25', lastReviewedDate: '2026-09-15', reviewCount: 1 }, // not reviewed today, not mastered
      q3: { pyqId: 'q3', box: 1, dueDate: TODAY, lastReviewedDate: null, reviewCount: 0 }, // never reviewed
    };
    const ctx = computeStudyContext({ today: TODAY, apfcHome: homeSnapshot(), revisionQueue, sessions: [], syllabusWeakCount: 0 });
    expect(ctx.revision.reviewedToday).toBe(1);
    expect(ctx.revision.masteredCount).toBe(1);
  });

  it('sums revision due-now as overdue + dueToday, keeping tomorrow/thisWeek separate', () => {
    const ctx = computeStudyContext({
      today: TODAY,
      apfcHome: homeSnapshot({ revisionBuckets: { overdue: 2, dueToday: 3, dueTomorrow: 1, dueThisWeek: 4 } }),
      revisionQueue: {},
      sessions: [],
      syllabusWeakCount: 0,
    });
    expect(ctx.revision.dueNow).toBe(5);
    expect(ctx.revision.dueTomorrow).toBe(1);
    expect(ctx.revision.dueThisWeek).toBe(4);
  });

  it('counts todaySessionCount accurately from real focus sessions completed today, excluding breaks and other days', () => {
    const sessions: PomodoroSession[] = [
      session({ id: 's1' }),
      session({ id: 's2' }),
      session({ id: 's3', mode: 'shortBreak' }),
      session({ id: 's4', completedAt: '2026-09-20T09:00:00.000Z' }),
    ];
    const ctx = computeStudyContext({ today: TODAY, apfcHome: homeSnapshot(), revisionQueue: {}, sessions, syllabusWeakCount: 0 });
    expect(ctx.focus.todaySessionCount).toBe(2);
  });

  it('passes syllabus weakCount and completedPct through verbatim, never recomputing topic status', () => {
    const ctx = computeStudyContext({ today: TODAY, apfcHome: homeSnapshot({ overallSyllabusPct: 42 }), revisionQueue: {}, sessions: [], syllabusWeakCount: 7 });
    expect(ctx.syllabus).toEqual({ completedPct: 42, weakCount: 7 });
  });

  it('sums last7DaysFocusMinutes and activeDaysLast7 from activityTrend verbatim', () => {
    const ctx = computeStudyContext({
      today: TODAY,
      apfcHome: homeSnapshot({
        activityTrend: [
          { date: '2026-09-16', focusMinutes: 30, topicsCompleted: 0, testsCompleted: 0, isActive: true },
          { date: '2026-09-17', focusMinutes: 0, topicsCompleted: 0, testsCompleted: 0, isActive: false },
          { date: '2026-09-22', focusMinutes: 50, topicsCompleted: 1, testsCompleted: 0, isActive: true },
        ],
      }),
      revisionQueue: {},
      sessions: [],
      syllabusWeakCount: 0,
    });
    expect(ctx.history).toEqual({ last7DaysFocusMinutes: 80, activeDaysLast7: 2 });
  });

  it('carries gamification xp/level/streak through verbatim from the existing snapshot', () => {
    const ctx = computeStudyContext({
      today: TODAY,
      apfcHome: homeSnapshot({
        gamification: { xp: 250, level: { level: 3, xp: 250, xpIntoLevel: 50, xpForNextLevel: 150, xpToNext: 100, progressPct: 33 }, streaks: { current: 5, best: 12 }, earnedBadges: [], nextBadge: null },
      }),
      revisionQueue: {},
      sessions: [],
      syllabusWeakCount: 0,
    });
    expect(ctx.gamification).toEqual({ xp: 250, level: 3, streakCurrent: 5, streakBest: 12 });
  });
});
