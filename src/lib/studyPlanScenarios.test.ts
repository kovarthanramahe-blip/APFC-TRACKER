import { describe, it, expect } from 'vitest';
import { simulateMissedStudyDays, simulateTargetDateShift } from './studyPlanScenarios';
import { computePlanHealth, type PlanHealthInput } from './studyPlanHealth';
import type { PersonalPlanTask } from './studyPlanEditing';
import type { PlanCapacity, StudyPlan, StudyPlanTask } from './studyPlan';
import type { SyllabusSubject } from './types';

// Fixtures mirror studyPlanHealth.test.ts exactly so both test files exercise the same plan shape.
const syllabus: SyllabusSubject[] = [
  {
    id: 'subj-a',
    title: 'Subject A',
    shortTitle: 'A',
    colorKey: 'english',
    weightageHint: '',
    topics: [
      { id: 't1', title: 'Topic One' },
      { id: 't2', title: 'Topic Two' },
      { id: 't3', title: 'Topic Three' },
    ],
  },
  {
    id: 'subj-b',
    title: 'Subject B',
    shortTitle: 'B',
    colorKey: 'polity',
    weightageHint: '',
    topics: [{ id: 't4', title: 'Topic Four' }],
  },
];

// Study days: 05,06,07,08,09,10,12,13,14 Jan 2026 (skipping Sun 11), 60 min/day.
const capacity: PlanCapacity = {
  totalCalendarDays: 10,
  studyWeekdays: [1, 2, 3, 4, 5, 6],
  studyDayDates: ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-12', '2026-01-13', '2026-01-14'],
  minutesPerStudyDay: 60,
  totalAvailableMinutes: 9 * 60,
  plannableMinutes: Math.floor(9 * 60 * 0.85),
};
const CURRENT_DATE = '2026-01-08'; // 05,06,07 are "the past"; 08,09,10,12,13,14 remain (6 days).

function task(overrides: Partial<StudyPlanTask> = {}): StudyPlanTask {
  return {
    id: overrides.id ?? 't1-coverage',
    date: overrides.date ?? '2026-01-09',
    topicId: overrides.topicId ?? 't1',
    subjectId: overrides.subjectId ?? 'subj-a',
    phase: overrides.phase ?? 'coverage',
    taskType: overrides.taskType ?? 'coverage',
    title: overrides.title ?? 'Study: Topic One',
    estimatedMinutes: overrides.estimatedMinutes ?? 50,
    priority: overrides.priority ?? 1,
    status: overrides.status ?? 'pending',
    reason: overrides.reason ?? 'Not yet covered.',
  };
}

function personalTask(overrides: Partial<PersonalPlanTask> = {}): PersonalPlanTask {
  return {
    id: overrides.id ?? 'p1',
    date: overrides.date ?? '2026-01-09',
    title: overrides.title ?? 'Revise my notes',
    estimatedMinutes: overrides.estimatedMinutes ?? 20,
    status: overrides.status ?? 'pending',
    taskType: 'personal',
    reason: overrides.reason ?? 'Added by you.',
  };
}

function buildPlan(tasks: StudyPlanTask[]): StudyPlan {
  return {
    config: { startDate: '2026-01-05', targetDate: '2026-01-14', studyDaysPerWeek: 6, hoursPerStudyDay: 1 },
    capacity,
    capacityReport: { availableMinutes: capacity.plannableMinutes, rawAvailableMinutes: capacity.totalAvailableMinutes, requiredMinutes: 0, deficitMinutes: 0, verdict: 'comfortable', message: '' },
    coverageSummary: { totalTopics: 4, strong: 0, needsCoverage: 0, needsRevision: 0, needsPractice: 0 },
    phases: [{ id: 'focused', title: 'Focused Prep', startDate: '2026-01-05', endDate: '2026-01-14', focus: '' }],
    tasks,
    unscheduledTopicIds: [],
  };
}

function input(overrides: Partial<PlanHealthInput> = {}): PlanHealthInput {
  return {
    plan: buildPlan([]),
    personalTasks: [],
    syllabus,
    completedTopics: {},
    pyqPerf: null,
    currentDate: CURRENT_DATE,
    ...overrides,
  };
}

function expectOk<T>(r: { ok: true; result: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(`expected ok result, got error: ${r.error}`);
  return r.result;
}

// --- 1-6: missed-days scenario -------------------------------------------------------------
describe('simulateMissedStudyDays', () => {
  it('0 missed days matches the current plan health', () => {
    const i = input({ plan: buildPlan([task({ estimatedMinutes: 120 })]) });
    const result = expectOk(simulateMissedStudyDays(i, 0));
    const current = computePlanHealth(i);
    expect(result.comparison.scenario.verdict).toBe(current.verdict);
    expect(result.comparison.scenario.remainingStudyDays).toBe(current.required.remainingStudyDays);
    expect(result.comparison.outcome).toBe('unchanged');
  });

  it('1 missed day reduces remaining study days by exactly 1', () => {
    const i = input({ plan: buildPlan([task({ estimatedMinutes: 120 })]) });
    const result = expectOk(simulateMissedStudyDays(i, 1));
    expect(result.comparison.scenario.remainingStudyDays).toBe(5); // 6 - 1
  });

  it('multiple missed days reduce remaining study days accordingly', () => {
    const i = input({ plan: buildPlan([task({ estimatedMinutes: 120 })]) });
    const result = expectOk(simulateMissedStudyDays(i, 3));
    expect(result.comparison.scenario.remainingStudyDays).toBe(3); // 6 - 3
    expect(result.missedDays).toBe(3);
  });

  it('rejects a negative missed-days value', () => {
    const i = input();
    const r = simulateMissedStudyDays(i, -1);
    expect(r.ok).toBe(false);
  });

  it('rejects a non-integer missed-days value', () => {
    const i = input();
    const r = simulateMissedStudyDays(i, 2.5);
    expect(r.ok).toBe(false);
  });

  it('does not mutate the original plan capacity or tasks', () => {
    const i = input({ plan: buildPlan([task({ estimatedMinutes: 120 })]) });
    const originalCapacity = i.plan.capacity;
    const originalTasks = i.plan.tasks;
    simulateMissedStudyDays(i, 3);
    expect(i.plan.capacity).toBe(originalCapacity);
    expect(i.plan.tasks).toBe(originalTasks);
    expect(i.plan.capacity.studyDayDates).toHaveLength(9);
  });
});

// --- 7-11: target-date scenario -------------------------------------------------------------
describe('simulateTargetDateShift', () => {
  it('extending the target date by 7 days increases remaining study days', () => {
    const i = input({ plan: buildPlan([task({ estimatedMinutes: 120 })]) });
    const before = computePlanHealth(i);
    const result = expectOk(simulateTargetDateShift(i, 7));
    expect(result.comparison.scenario.remainingStudyDays).toBeGreaterThan(before.required.remainingStudyDays);
  });

  it('shortening the target date by 7 days does not increase remaining study days', () => {
    const i = input({ plan: buildPlan([task({ estimatedMinutes: 120 })]) });
    const before = computePlanHealth(i);
    const result = expectOk(simulateTargetDateShift(i, -7));
    expect(result.comparison.scenario.remainingStudyDays).toBeLessThanOrEqual(before.required.remainingStudyDays);
  });

  it('a shift of 0 leaves the plan unchanged', () => {
    const i = input({ plan: buildPlan([task({ estimatedMinutes: 120 })]) });
    const result = expectOk(simulateTargetDateShift(i, 0));
    const current = computePlanHealth(i);
    expect(result.comparison.scenario.remainingStudyDays).toBe(current.required.remainingStudyDays);
    expect(result.comparison.outcome).toBe('unchanged');
  });

  it('does not mutate the original target date or config', () => {
    const i = input({ plan: buildPlan([task({ estimatedMinutes: 120 })]) });
    simulateTargetDateShift(i, 7);
    expect(i.plan.config.targetDate).toBe('2026-01-14');
  });

  it('does not mutate the original tasks array', () => {
    const i = input({ plan: buildPlan([task({ estimatedMinutes: 120 })]) });
    const originalTasks = i.plan.tasks;
    simulateTargetDateShift(i, 7);
    expect(i.plan.tasks).toBe(originalTasks);
  });

  it('rejects a non-integer target-date shift', () => {
    const r = simulateTargetDateShift(input(), 3.5);
    expect(r.ok).toBe(false);
  });
});

// --- 12-14: comparison outcome detection ------------------------------------------------------
describe('scenario comparison outcome', () => {
  it('detects improvement when the scenario is healthier than the current plan', () => {
    // Small remaining load + shortened runway still fits; extending the deadline should improve it.
    const i = input({ plan: buildPlan([task({ estimatedMinutes: 350 })]) }); // tight at baseline
    const result = expectOk(simulateTargetDateShift(i, 14));
    expect(result.comparison.outcome).toBe('improves');
  });

  it('detects deterioration when the scenario is worse than the current plan', () => {
    const i = input({ plan: buildPlan([task({ estimatedMinutes: 300 })]) });
    const result = expectOk(simulateMissedStudyDays(i, 5));
    expect(result.comparison.outcome).toBe('worsens');
  });

  it('reports unchanged when the scenario matches the current plan exactly', () => {
    const i = input({ plan: buildPlan([task({ estimatedMinutes: 120 })]) });
    const result = expectOk(simulateMissedStudyDays(i, 0));
    expect(result.comparison.outcome).toBe('unchanged');
    expect(result.comparison.requiredMinutesPerDayDelta).toBe(0);
  });
});

// --- 15-16: required time / over-capacity detection ------------------------------------------
describe('required daily time and over-capacity detection', () => {
  it('required minutes/day increases as missed days increase', () => {
    const i = input({ plan: buildPlan([task({ estimatedMinutes: 120 })]) });
    const r1 = expectOk(simulateMissedStudyDays(i, 1));
    const r3 = expectOk(simulateMissedStudyDays(i, 3));
    expect(r3.comparison.scenario.requiredMinutesPerStudyDay).toBeGreaterThan(r1.comparison.scenario.requiredMinutesPerStudyDay);
  });

  it('detects an over-capacity scenario when missing enough days', () => {
    const i = input({ plan: buildPlan([task({ estimatedMinutes: 350 })]) }); // tight baseline
    const result = expectOk(simulateMissedStudyDays(i, 5)); // only 1 study day left for 350 min
    expect(result.comparison.scenario.verdict).toBe('over_capacity');
    expect(result.recommendation).toMatch(/exceed available capacity/i);
  });
});

// --- 17-18: determinism -----------------------------------------------------------------------
describe('scenario determinism', () => {
  it('recommendation text is deterministic for the same input', () => {
    const i = input({ plan: buildPlan([task({ estimatedMinutes: 350 })]) });
    const a = expectOk(simulateMissedStudyDays(i, 5));
    const b = expectOk(simulateMissedStudyDays(i, 5));
    expect(a.recommendation).toBe(b.recommendation);
  });

  it('identical input produces an identical result object', () => {
    const i = input({ plan: buildPlan([task({ estimatedMinutes: 200 })]), personalTasks: [personalTask()] });
    const a = expectOk(simulateTargetDateShift(i, 5));
    const b = expectOk(simulateTargetDateShift(i, 5));
    expect(a).toEqual(b);
  });
});
