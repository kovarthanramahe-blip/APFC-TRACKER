import { describe, it, expect } from 'vitest';
import { computeDailyMission, computeWeeklyChallenge } from './gamificationMissions';
import type { StudyContext } from './studyContext';

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

describe('computeDailyMission', () => {
  it('falls back to a focus-minutes mission when nothing is planned or due', () => {
    const mission = computeDailyMission(baseContext());
    expect(mission.category).toBe('focus');
    expect(mission.target).toBe(60);
    expect(mission.completed).toBe(false);
    expect(mission.actionHref).toBe('/pomodoro');
  });

  it('uses a 30-minute fallback target when dailyGoalMinutes is 0, never an impossible 0-minute goal', () => {
    const mission = computeDailyMission(baseContext({ focus: { todayMinutes: 0, dailyGoalMinutes: 0, todaySessionCount: 0 } }));
    expect(mission.target).toBe(30);
  });

  it('marks the focus mission completed once todayMinutes reaches the target', () => {
    const mission = computeDailyMission(baseContext({ focus: { todayMinutes: 60, dailyGoalMinutes: 60, todaySessionCount: 2 } }));
    expect(mission.completed).toBe(true);
    expect(mission.progressPct).toBe(100);
  });

  it('prefers the planner mission when the plan has work scheduled today, over revision/focus', () => {
    const ctx = baseContext({
      planner: { hasPlan: true, todayPending: 2, todayCompleted: 1, overdueCount: 0, nextTaskTitle: 'X', nextTaskReason: 'r' },
      revision: { dueNow: 5, dueTomorrow: 0, dueThisWeek: 0, reviewedToday: 0, masteredCount: 0 },
    });
    const mission = computeDailyMission(ctx);
    expect(mission.category).toBe('planner');
    expect(mission.current).toBe(1);
    expect(mission.target).toBe(3);
    expect(mission.completed).toBe(false);
  });

  it('stays the planner mission (shown as completed) once todayPending reaches 0, never silently switching to revision/focus', () => {
    const ctx = baseContext({
      planner: { hasPlan: true, todayPending: 0, todayCompleted: 3, overdueCount: 0, nextTaskTitle: null, nextTaskReason: null },
      revision: { dueNow: 5, dueTomorrow: 0, dueThisWeek: 0, reviewedToday: 0, masteredCount: 0 },
    });
    const mission = computeDailyMission(ctx);
    expect(mission.category).toBe('planner');
    expect(mission.completed).toBe(true);
    expect(mission.progressPct).toBe(100);
  });

  it('selects the revision mission when there is no active plan but revision activity exists today', () => {
    const ctx = baseContext({ revision: { dueNow: 2, dueTomorrow: 0, dueThisWeek: 0, reviewedToday: 1, masteredCount: 0 } });
    const mission = computeDailyMission(ctx);
    expect(mission.category).toBe('revision');
    expect(mission.current).toBe(1);
    expect(mission.target).toBe(3);
    expect(mission.actionHref).toBe('/revision');
  });

  it('stays the revision mission (completed) once dueNow reaches 0, as long as something was reviewed today', () => {
    const ctx = baseContext({ revision: { dueNow: 0, dueTomorrow: 0, dueThisWeek: 0, reviewedToday: 4, masteredCount: 0 } });
    const mission = computeDailyMission(ctx);
    expect(mission.category).toBe('revision');
    expect(mission.completed).toBe(true);
  });

  it('never divides by zero when target is 0 for an edge case', () => {
    const ctx = baseContext({ planner: { hasPlan: true, todayPending: 0, todayCompleted: 0, overdueCount: 0, nextTaskTitle: null, nextTaskReason: null } });
    // todayPending + todayCompleted === 0 -> planner branch not selected -> falls through to focus.
    const mission = computeDailyMission(ctx);
    expect(mission.category).toBe('focus');
  });
});

describe('computeWeeklyChallenge', () => {
  it('targets dailyGoalMinutes * 5 and reads current straight from history.last7DaysFocusMinutes', () => {
    const ctx = baseContext({ focus: { todayMinutes: 0, dailyGoalMinutes: 60, todaySessionCount: 0 }, history: { last7DaysFocusMinutes: 150, activeDaysLast7: 3 } });
    const challenge = computeWeeklyChallenge(ctx);
    expect(challenge.target).toBe(300);
    expect(challenge.current).toBe(150);
    expect(challenge.progressPct).toBe(50);
    expect(challenge.completed).toBe(false);
  });

  it('is completed once current meets or exceeds target', () => {
    const ctx = baseContext({ focus: { todayMinutes: 0, dailyGoalMinutes: 30, todaySessionCount: 0 }, history: { last7DaysFocusMinutes: 200, activeDaysLast7: 5 } });
    const challenge = computeWeeklyChallenge(ctx);
    expect(challenge.target).toBe(150);
    expect(challenge.completed).toBe(true);
    expect(challenge.progressPct).toBe(100);
  });

  it('uses the same 30-minute fallback as the daily mission when dailyGoalMinutes is 0', () => {
    const ctx = baseContext({ focus: { todayMinutes: 0, dailyGoalMinutes: 0, todaySessionCount: 0 } });
    const challenge = computeWeeklyChallenge(ctx);
    expect(challenge.target).toBe(150);
  });

  it('zeroes cleanly for a brand-new user with no history at all', () => {
    const challenge = computeWeeklyChallenge(baseContext());
    expect(challenge.current).toBe(0);
    expect(challenge.completed).toBe(false);
  });
});
