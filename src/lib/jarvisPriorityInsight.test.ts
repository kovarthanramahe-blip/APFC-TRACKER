import { describe, it, expect } from 'vitest';
import { computeJarvisPriorityInsight } from './jarvisPriorityInsight';
import type { StudyContext } from './studyContext';
import type { DailyMission, WeeklyChallenge } from './gamificationMissions';

function baseContext(overrides: Partial<StudyContext> = {}): StudyContext {
  return {
    today: '2026-09-22',
    planner: { hasPlan: false, todayPending: 0, todayCompleted: 0, overdueCount: 0, nextTaskTitle: null, nextTaskReason: null },
    revision: { dueNow: 0, dueTomorrow: 0, dueThisWeek: 0, reviewedToday: 0, masteredCount: 0 },
    syllabus: { completedPct: 0, weakCount: 0 },
    focus: { todayMinutes: 0, dailyGoalMinutes: 60, todaySessionCount: 0 },
    history: { last7DaysFocusMinutes: 0, activeDaysLast7: 0 },
    gamification: { xp: 0, level: 1, streakCurrent: 0, streakBest: 0 },
    ...overrides,
  };
}

const completedMission: DailyMission = {
  category: 'focus',
  title: 'Focus for 60 minutes today',
  description: '60 of 60 minutes focused today.',
  current: 60,
  target: 60,
  progressPct: 100,
  completed: true,
  actionLabel: 'Start Focus',
  actionHref: '/pomodoro',
};

const openMission: DailyMission = { ...completedMission, current: 20, progressPct: 33, completed: false, description: '20 of 60 minutes focused today.' };

const openWeekly: WeeklyChallenge = {
  title: 'Weekly Focus Challenge',
  description: '100 of 300 minutes focused in the last 7 days.',
  current: 100,
  target: 300,
  progressPct: 33,
  completed: false,
  actionLabel: 'Start Focus',
  actionHref: '/pomodoro',
};
const completedWeekly: WeeklyChallenge = { ...openWeekly, current: 300, progressPct: 100, completed: true, description: '300 of 300 minutes focused in the last 7 days.' };

describe('computeJarvisPriorityInsight', () => {
  it('prioritises overdue planner work above everything else', () => {
    const ctx = baseContext({ planner: { hasPlan: true, todayPending: 1, todayCompleted: 0, overdueCount: 2, nextTaskTitle: 'X', nextTaskReason: 'r' }, revision: { dueNow: 5, dueTomorrow: 0, dueThisWeek: 0, reviewedToday: 0, masteredCount: 0 } });
    const insight = computeJarvisPriorityInsight(ctx, openMission, openWeekly);
    expect(insight.category).toBe('priority');
    expect(insight.title).toContain('overdue task');
    expect(insight.actionHref).toBe('/study-plan');
  });

  it('prioritises revision due-now above the daily mission and syllabus weak areas, matching the spec worked example', () => {
    const ctx = baseContext({ revision: { dueNow: 2, dueTomorrow: 0, dueThisWeek: 0, reviewedToday: 0, masteredCount: 0 }, syllabus: { completedPct: 10, weakCount: 3 } });
    const insight = computeJarvisPriorityInsight(ctx, openMission, openWeekly);
    expect(insight.category).toBe('priority');
    expect(insight.title).toBe('2 revision items due');
    expect(insight.reason).toContain('2 APFC revision items are overdue or due today');
    expect(insight.actionLabel).toBe('Start Revision');
    expect(insight.actionHref).toBe('/revision');
  });

  it('recommends the open daily mission when nothing is overdue/due', () => {
    const insight = computeJarvisPriorityInsight(baseContext(), openMission, openWeekly);
    expect(insight.category).toBe('recommendation');
    expect(insight.title).toBe(openMission.title);
    expect(insight.actionHref).toBe(openMission.actionHref);
  });

  it('warns about weak syllabus areas once the mission is already done and nothing else is due', () => {
    const ctx = baseContext({ syllabus: { completedPct: 40, weakCount: 2 } });
    const insight = computeJarvisPriorityInsight(ctx, completedMission, openWeekly);
    expect(insight.category).toBe('warning');
    expect(insight.title).toBe('2 weak syllabus areas');
    expect(insight.actionHref).toBe('/syllabus');
  });

  it('celebrates a completed WEEKLY challenge — not merely a completed daily mission, which is too routine to count as an achievement', () => {
    const insight = computeJarvisPriorityInsight(baseContext(), completedMission, completedWeekly);
    expect(insight.category).toBe('achievement');
    expect(insight.title).toBe('Weekly focus challenge complete');
  });

  it('shows streak progress when nothing else applies and a real multi-day streak exists', () => {
    const ctx = baseContext({ gamification: { xp: 500, level: 4, streakCurrent: 5, streakBest: 10 } });
    const insight = computeJarvisPriorityInsight(ctx, completedMission, openWeekly);
    expect(insight.category).toBe('progress');
    expect(insight.title).toBe('5 days streak');
    expect(insight.actionHref).toBe('/analytics');
  });

  it('falls back to a motivation message when there is truly nothing else to say', () => {
    const insight = computeJarvisPriorityInsight(baseContext(), completedMission, openWeekly);
    expect(insight.category).toBe('motivation');
    expect(insight.title.length).toBeGreaterThan(0);
    expect(insight.actionHref).toBe('/pomodoro');
  });

  it('is fully deterministic — the same input always produces the same insight', () => {
    const ctx = baseContext({ revision: { dueNow: 1, dueTomorrow: 0, dueThisWeek: 0, reviewedToday: 0, masteredCount: 0 } });
    const a = computeJarvisPriorityInsight(ctx, openMission, openWeekly);
    const b = computeJarvisPriorityInsight(ctx, openMission, openWeekly);
    expect(a).toEqual(b);
  });
});
