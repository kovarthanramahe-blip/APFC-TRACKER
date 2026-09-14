import { describe, it, expect } from 'vitest';
import {
  computePlanHealth,
  forecastAfterMissedDays,
  forecastWithTargetDateShift,
  type PlanHealthInput,
} from './studyPlanHealth';
import type { PersonalPlanTask } from './studyPlanEditing';
import { computeUnifiedTopicStatus } from './topicStatus';
import { computePyqPerformance } from './pyqPerformance';
import type { PlanCapacity, StudyPlan, StudyPlanTask } from './studyPlan';
import type { SyllabusSubject, PYQ, PYQAttempt } from './types';
import { SYLLABUS } from '../data/syllabus';
import { generateStudyPlan } from './studyPlan';

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

function input(overrides: Partial<PlanHealthInput>): PlanHealthInput {
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

function pyq(id: string, topicId: string): PYQ {
  return {
    id,
    year: 2025,
    subject: 'english',
    topicId,
    question: `Q ${id}`,
    options: [{ id: `${id}-o0`, text: 'A' }, { id: `${id}-o1`, text: 'B' }],
    correctOptionId: `${id}-o0`,
    explanation: '',
    verificationStatus: 'cross_verified',
  };
}
function attempt(overrides: Partial<PYQAttempt>): PYQAttempt {
  return {
    id: overrides.id ?? 'a1',
    submittedAt: '2026-01-01T00:00:00.000Z',
    year: 'all',
    subject: 'all',
    topicId: 'all',
    questionIds: overrides.questionIds ?? [],
    answers: overrides.answers ?? {},
    correctCount: overrides.correctCount ?? 0,
    wrongCount: overrides.wrongCount ?? 0,
    unansweredCount: overrides.unansweredCount ?? 0,
    score: 0,
    accuracy: 0,
  };
}
const bank: PYQ[] = [pyq('t1-q0', 't1'), pyq('t1-q1', 't1'), pyq('t1-q2', 't1')];
const weakPerf = computePyqPerformance(
  bank,
  [attempt({ questionIds: ['t1-q0', 't1-q1', 't1-q2'], answers: { 't1-q0': 't1-q0-o1', 't1-q1': 't1-q1-o1', 't1-q2': 't1-q2-o0' }, correctCount: 1, wrongCount: 2 })],
);

// --- 1-2: empty / fully completed plans ---------------------------------------
describe('computePlanHealth — empty and completed plans', () => {
  it('an empty/new plan (no tasks at all) reports verdict completed with zero remaining work', () => {
    const report = computePlanHealth(input({ plan: buildPlan([]) }));
    expect(report.verdict).toBe('completed');
    expect(report.required.remainingTaskMinutes).toBe(0);
    expect(report.missedTaskCount).toBe(0);
  });

  it('a fully completed plan (all tasks completed) reports verdict completed', () => {
    const tasks = [task({ id: 't1-coverage', status: 'completed', date: '2026-01-05' }), task({ id: 't2-coverage', topicId: 't2', status: 'completed', date: '2026-01-06' })];
    const report = computePlanHealth(input({ plan: buildPlan(tasks) }));
    expect(report.verdict).toBe('completed');
    expect(report.required.remainingTaskMinutes).toBe(0);
    expect(report.recommendations[0]).toMatch(/complete/i);
  });
});

// --- 3-5: verdicts -----------------------------------------------------------------
describe('computePlanHealth — verdicts', () => {
  it('a light pending workload is on_track with a likely_to_finish forecast', () => {
    const tasks = [task({ id: 't1-coverage', estimatedMinutes: 50, date: '2026-01-09' })];
    const report = computePlanHealth(input({ plan: buildPlan(tasks) }));
    expect(report.verdict).toBe('on_track');
    expect(report.forecast).toBe('likely_to_finish');
  });

  it('a workload that exactly fills remaining capacity (no buffer) is tight', () => {
    // 6 remaining study days x 60 min = 360 total; plannableMinutes = floor(360*0.85) = 306.
    // A pending load between 306 and 360 is "tight" (fits raw, but not the buffered amount).
    const tasks = [task({ id: 't1-coverage', estimatedMinutes: 350, date: '2026-01-09' })];
    const report = computePlanHealth(input({ plan: buildPlan(tasks) }));
    expect(report.verdict).toBe('tight');
  });

  it('a workload beyond raw available capacity is over_capacity', () => {
    const tasks = [task({ id: 't1-coverage', estimatedMinutes: 1000, date: '2026-01-09' })];
    const report = computePlanHealth(input({ plan: buildPlan(tasks) }));
    expect(report.verdict).toBe('over_capacity');
    expect(report.forecast).toBe('unlikely_to_finish');
    expect(report.bottlenecks.some((b) => b.type === 'insufficient_capacity')).toBe(true);
  });
});

// --- 6-9: required capacity math -----------------------------------------------------
describe('computePlanHealth — required capacity', () => {
  it('computes required minutes per study day correctly', () => {
    const tasks = [task({ id: 't1-coverage', estimatedMinutes: 120, date: '2026-01-09' })];
    const report = computePlanHealth(input({ plan: buildPlan(tasks) }));
    // 120 minutes over 6 remaining study days -> ceil(120/6) = 20/day.
    expect(report.required.remainingTaskMinutes).toBe(120);
    expect(report.required.remainingStudyDays).toBe(6);
    expect(report.required.requiredMinutesPerStudyDay).toBe(20);
    expect(report.required.configuredMinutesPerStudyDay).toBe(60);
    expect(report.required.capacityDifferenceMinutes).toBe(40);
  });

  it('excludes completed tasks from remaining task minutes', () => {
    const tasks = [task({ id: 't1-coverage', status: 'completed', estimatedMinutes: 500, date: '2026-01-06' }), task({ id: 't2-coverage', topicId: 't2', estimatedMinutes: 30, date: '2026-01-09' })];
    const report = computePlanHealth(input({ plan: buildPlan(tasks) }));
    expect(report.required.remainingTaskMinutes).toBe(30);
  });

  it('pending personal tasks consume capacity', () => {
    const withoutPersonal = computePlanHealth(input({ plan: buildPlan([task({ estimatedMinutes: 50 })]) }));
    const withPersonal = computePlanHealth(input({ plan: buildPlan([task({ estimatedMinutes: 50 })]), personalTasks: [personalTask({ estimatedMinutes: 20 })] }));
    expect(withPersonal.required.remainingTaskMinutes).toBe(withoutPersonal.required.remainingTaskMinutes + 20);
  });

  it('completed personal tasks do not consume remaining capacity', () => {
    const withCompletedPersonal = computePlanHealth(
      input({ plan: buildPlan([task({ estimatedMinutes: 50 })]), personalTasks: [personalTask({ status: 'completed', estimatedMinutes: 20 })] }),
    );
    const baseline = computePlanHealth(input({ plan: buildPlan([task({ estimatedMinutes: 50 })]) }));
    expect(withCompletedPersonal.required.remainingTaskMinutes).toBe(baseline.required.remainingTaskMinutes);
  });
});

// --- 10-13: syllabus / PYQ signals ------------------------------------------------------
describe('computePlanHealth — syllabus and PYQ signals', () => {
  it('syllabus forecast matches computeUnifiedTopicStatus directly', () => {
    const completedTopics = { t1: true };
    const report = computePlanHealth(input({ plan: buildPlan([]), completedTopics }));
    const statuses = computeUnifiedTopicStatus(syllabus, completedTopics, null);
    expect(report.syllabus.totalTopics).toBe(statuses.length);
    expect(report.syllabus.coveredTopics).toBe(statuses.filter((s) => s.covered).length);
    expect(report.syllabus.strongTopics).toBe(statuses.filter((s) => s.status === 'strong').length);
  });

  it('PYQ signal is reused directly from computePyqPerformance, no second accuracy calc', () => {
    const report = computePlanHealth(input({ plan: buildPlan([]), pyqPerf: weakPerf }));
    expect(report.pyq.hasSignal).toBe(true);
    expect(report.pyq.totalAttempted).toBe(weakPerf!.overall.totalAttempted);
    expect(report.pyq.overallAccuracy).toBe(weakPerf!.overall.overallAccuracy);
  });

  it('no PYQ data produces a clean no-signal state, not a poor-performance state', () => {
    const report = computePlanHealth(input({ plan: buildPlan([]), pyqPerf: null }));
    expect(report.pyq.hasSignal).toBe(false);
    expect(report.pyq.overallAccuracy).toBeNull();
    expect(report.bottlenecks.some((b) => b.type === 'weak_pyq_topics')).toBe(false);
  });

  it('weak PYQ topics surface as a bottleneck when accuracy is genuinely weak', () => {
    const report = computePlanHealth(input({ plan: buildPlan([]), pyqPerf: weakPerf }));
    expect(report.bottlenecks.some((b) => b.type === 'weak_pyq_topics')).toBe(true);
  });
});

// --- 14-16: scenario helpers ------------------------------------------------------------
describe('scenario helpers', () => {
  it('forecastAfterMissedDays reduces remaining capacity without mutating the original plan', () => {
    const i = input({ plan: buildPlan([task({ estimatedMinutes: 50 })]) });
    const originalCapacity = i.plan.capacity;
    const result = forecastAfterMissedDays(i, 3);
    expect(result.required.remainingStudyDays).toBe(3); // 6 remaining - 3 missed
    expect(i.plan.capacity).toBe(originalCapacity); // untouched reference
    expect(i.plan.capacity.studyDayDates).toHaveLength(9); // original array untouched
  });

  it('extending the target date increases remaining capacity', () => {
    const i = input({ plan: buildPlan([task({ estimatedMinutes: 50 })]) });
    const before = computePlanHealth(i);
    const after = forecastWithTargetDateShift(i, 7);
    expect(after.required.remainingStudyDays).toBeGreaterThan(before.required.remainingStudyDays);
    expect(i.plan.config.targetDate).toBe('2026-01-14'); // original config untouched
  });

  it('pulling the target date earlier decreases remaining capacity and can worsen the verdict', () => {
    const i = input({ plan: buildPlan([task({ estimatedMinutes: 300 })]) });
    const before = computePlanHealth(i);
    const after = forecastWithTargetDateShift(i, -8); // target moves to 2026-01-06, before CURRENT_DATE
    expect(after.required.remainingStudyDays).toBeLessThanOrEqual(before.required.remainingStudyDays);
    expect(after.verdict === 'over_capacity' || after.verdict === 'at_risk' || after.verdict === 'tight').toBe(true);
  });
});

// --- 17-19: determinism / no invalid numbers ---------------------------------------------
describe('computePlanHealth — determinism and value safety', () => {
  it('recommendations are deterministic', () => {
    const i = input({ plan: buildPlan([task({ estimatedMinutes: 1000 })]) });
    expect(computePlanHealth(i).recommendations).toEqual(computePlanHealth(i).recommendations);
  });

  it('identical input always produces identical output', () => {
    const i = input({ plan: buildPlan([task({ estimatedMinutes: 50, date: '2026-01-05' })]), pyqPerf: weakPerf, personalTasks: [personalTask()] });
    expect(computePlanHealth(i)).toEqual(computePlanHealth(i));
  });

  it('never produces NaN, Infinity, or negative numbers across a range of scenarios', () => {
    const scenarios: PlanHealthInput[] = [
      input({ plan: buildPlan([]) }),
      input({ plan: buildPlan([task({ estimatedMinutes: 50 })]) }),
      input({ plan: buildPlan([task({ estimatedMinutes: 5000 })]) }),
      input({ plan: buildPlan([task({ status: 'completed' })]) }),
    ];
    for (const s of scenarios) {
      const report = computePlanHealth(s);
      const nums = [
        report.required.remainingTaskMinutes,
        report.required.requiredMinutesPerStudyDay,
        report.required.requiredHoursPerDay,
        report.required.utilizationPercentage,
        report.capacity.remainingAvailableMinutes,
        report.capacity.utilizationPct,
        report.syllabus.totalTopics,
        report.syllabus.remainingTopics,
      ];
      for (const n of nums) {
        expect(Number.isFinite(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// --- Real syllabus data -----------------------------------------------------------------
describe('computePlanHealth — real APFC syllabus data', () => {
  it('runs end-to-end against a real generated plan', () => {
    const generated = generateStudyPlan({
      config: { startDate: '2026-01-01', targetDate: '2026-12-20', studyDaysPerWeek: 6, hoursPerStudyDay: 3 },
      syllabus: SYLLABUS,
      completedTopics: {},
      pyqPerf: null,
    });
    if (!generated.ok) throw new Error('expected ok plan');
    const report = computePlanHealth(input({ plan: generated.plan, syllabus: SYLLABUS, currentDate: '2026-01-01' }));
    expect(['on_track', 'tight', 'at_risk', 'over_capacity', 'completed']).toContain(report.verdict);
    expect(report.syllabus.totalTopics).toBeGreaterThan(0);
  });
});
