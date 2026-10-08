import { describe, it, expect } from 'vitest';
import { answerDeterministicQuestion } from './jarvisDeterministicQA';
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

const mission: DailyMission = {
  category: 'focus',
  title: 'Focus for 60 minutes today',
  description: '0 of 60 minutes focused today.',
  current: 0,
  target: 60,
  progressPct: 0,
  completed: false,
  actionLabel: 'Start Focus',
  actionHref: '/pomodoro',
};

const weekly: WeeklyChallenge = {
  title: 'Weekly Focus Challenge',
  description: '0 of 300 minutes focused in the last 7 days.',
  current: 0,
  target: 300,
  progressPct: 0,
  completed: false,
  actionLabel: 'Start Focus',
  actionHref: '/pomodoro',
};

describe('answerDeterministicQuestion', () => {
  it('returns null for an empty query', () => {
    expect(answerDeterministicQuestion('', baseContext(), mission, weekly)).toBeNull();
  });

  it('returns null for a query matching none of the known patterns, falling through honestly', () => {
    expect(answerDeterministicQuestion('tell me a joke', baseContext(), mission, weekly)).toBeNull();
  });

  it('answers "what should I study today" with overdue work first when present', () => {
    const ctx = baseContext({ planner: { hasPlan: true, todayPending: 1, todayCompleted: 0, overdueCount: 1, nextTaskTitle: 'X', nextTaskReason: 'r' } });
    const result = answerDeterministicQuestion('What should I study today?', ctx, mission, weekly);
    expect(result).not.toBeNull();
    expect(result!.answer).toContain('overdue task');
    expect(result!.actionHref).toBe('/study-plan');
  });

  it('answers "what should I study today" with the next planner task when nothing is overdue/due', () => {
    const ctx = baseContext({ planner: { hasPlan: true, todayPending: 1, todayCompleted: 0, overdueCount: 0, nextTaskTitle: 'Reading Comprehension', nextTaskReason: 'Needs syllabus coverage' } });
    const result = answerDeterministicQuestion('what should i study next', ctx, mission, weekly);
    expect(result!.answer).toContain('Reading Comprehension');
    expect(result!.why).toBe('Needs syllabus coverage');
  });

  it('falls back to the daily mission when there is no overdue work, no due revision, and no named next task', () => {
    const result = answerDeterministicQuestion('what should i do today', baseContext(), mission, weekly);
    expect(result!.answer).toBe(mission.title);
    expect(result!.actionHref).toBe(mission.actionHref);
  });

  it('answers "what is overdue" honestly with zero when nothing is overdue', () => {
    const result = answerDeterministicQuestion('what is overdue?', baseContext(), mission, weekly);
    expect(result!.answer).toBe('Nothing is overdue right now.');
  });

  it('answers "what is overdue" with real counts from both sources', () => {
    const ctx = baseContext({ planner: { hasPlan: true, todayPending: 0, todayCompleted: 0, overdueCount: 2, nextTaskTitle: null, nextTaskReason: null }, revision: { dueNow: 3, dueTomorrow: 0, dueThisWeek: 0, reviewedToday: 0, masteredCount: 0 } });
    const result = answerDeterministicQuestion('What is overdue', ctx, mission, weekly);
    expect(result!.answer).toContain('2 overdue planned tasks');
    expect(result!.answer).toContain('3 revision items due');
  });

  it('answers "how am I doing this week" using real weekly history/streak numbers', () => {
    const ctx = baseContext({ history: { last7DaysFocusMinutes: 150, activeDaysLast7: 3 }, gamification: { xp: 100, level: 2, streakCurrent: 3, streakBest: 5 } });
    const result = answerDeterministicQuestion('How am I doing this week?', ctx, mission, { ...weekly, current: 150, target: 300, progressPct: 50 });
    expect(result!.answer).toContain('2h 30m');
    expect(result!.why).toContain('3 active days');
    expect(result!.why).toContain('50%');
  });

  it('answers a syllabus-progress question with completedPct and weak areas', () => {
    const ctx = baseContext({ syllabus: { completedPct: 35, weakCount: 2 } });
    const result = answerDeterministicQuestion('How is my syllabus progressing?', ctx, mission, weekly);
    expect(result!.answer).toContain('35%');
    expect(result!.why).toContain('2 topics');
  });

  it('answers "what did I accomplish today" honestly with nothing logged', () => {
    const result = answerDeterministicQuestion('what did I accomplish today?', baseContext(), mission, weekly);
    expect(result!.answer).toBe("Nothing's logged yet today.");
  });

  it('answers "what did I accomplish today" with real today-only numbers', () => {
    const ctx = baseContext({ focus: { todayMinutes: 25, dailyGoalMinutes: 60, todaySessionCount: 1 }, planner: { hasPlan: true, todayPending: 0, todayCompleted: 2, overdueCount: 0, nextTaskTitle: null, nextTaskReason: null }, revision: { dueNow: 0, dueTomorrow: 0, dueThisWeek: 0, reviewedToday: 1, masteredCount: 0 } });
    const result = answerDeterministicQuestion('What did I accomplish today', ctx, mission, weekly);
    expect(result!.answer).toContain('25m focused');
    expect(result!.answer).toContain('2 planned tasks completed');
    expect(result!.answer).toContain('1 revision item reviewed');
  });

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    const result = answerDeterministicQuestion('  WHAT IS OVERDUE?  ', baseContext(), mission, weekly);
    expect(result).not.toBeNull();
  });
});
