import { describe, it, expect } from 'vitest';
import { computeDailyStudyQueue, MAX_NEXT_UP, type DailyQueueInput } from './studyPlanDailyQueue';
import type { PersonalPlanTask } from './studyPlanEditing';
import { computePyqPerformance } from './pyqPerformance';
import type { PlanCapacity, StudyPlan, StudyPlanTask } from './studyPlan';
import type { SyllabusSubject, PYQ, PYQAttempt } from './types';

// Fixtures mirror studyPlanHealth.test.ts / studyPlanScenarios.test.ts exactly, so all three test
// files exercise the same plan shape.
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
const CURRENT_DATE = '2026-01-08'; // 05,06,07 are "the past"; 08 is today; 09,10,12,13,14 are upcoming.
const REST_DATE = '2026-01-11'; // Sunday — not a configured study day.

function task(overrides: Partial<StudyPlanTask> = {}): StudyPlanTask {
  return {
    id: overrides.id ?? 't1-coverage',
    date: overrides.date ?? CURRENT_DATE,
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
    date: overrides.date ?? CURRENT_DATE,
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

function input(overrides: Partial<DailyQueueInput> = {}): DailyQueueInput {
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

function assertActive(result: ReturnType<typeof computeDailyStudyQueue>) {
  if (result.status !== 'active') throw new Error(`expected status 'active', got '${result.status}'`);
  return result;
}

// --- 1: no plan -----------------------------------------------------------------------------
describe('computeDailyStudyQueue — no plan', () => {
  it('reports status no_plan when no plan has been generated', () => {
    const result = computeDailyStudyQueue(input({ plan: null }));
    expect(result.status).toBe('no_plan');
  });
});

// --- 2: rest day ------------------------------------------------------------------------------
describe('computeDailyStudyQueue — rest day', () => {
  it('reports todayState rest_day when today is not a configured study day and nothing is scheduled', () => {
    const tasks = [task({ id: 't2-coverage', topicId: 't2', date: '2026-01-12' })]; // keeps the plan not-completed
    const result = assertActive(computeDailyStudyQueue(input({ plan: buildPlan(tasks), currentDate: REST_DATE })));
    expect(result.todayState).toBe('rest_day');
    expect(result.isStudyDay).toBe(false);
    expect(result.todayPending).toHaveLength(0);
  });
});

// --- 3-4: today's pending / completed tasks --------------------------------------------------
describe('computeDailyStudyQueue — today tasks', () => {
  it("returns today's pending tasks", () => {
    const tasks = [task({ id: 't1-coverage', date: CURRENT_DATE })];
    const result = assertActive(computeDailyStudyQueue(input({ plan: buildPlan(tasks) })));
    expect(result.todayPending).toHaveLength(1);
    expect(result.todayPending[0].task.id).toBe('t1-coverage');
    expect(result.todayState).toBe('pending');
  });

  it("counts today's completed tasks and excludes them from todayPending", () => {
    const tasks = [task({ id: 't1-coverage', date: CURRENT_DATE, status: 'completed' }), task({ id: 't2-coverage', topicId: 't2', date: '2026-01-09' })];
    const result = assertActive(computeDailyStudyQueue(input({ plan: buildPlan(tasks) })));
    expect(result.todayCompletedCount).toBe(1);
    expect(result.todayPending).toHaveLength(0);
    expect(result.todayState).toBe('all_completed');
  });
});

// --- 5-6: overdue tasks -------------------------------------------------------------------------
describe('computeDailyStudyQueue — overdue tasks', () => {
  it('identifies pending tasks dated before currentDate as overdue', () => {
    const tasks = [task({ id: 't1-coverage', date: '2026-01-06' })];
    const result = assertActive(computeDailyStudyQueue(input({ plan: buildPlan(tasks) })));
    expect(result.overdueTasks).toHaveLength(1);
    expect(result.overdueTasks[0].overdue).toBe(true);
    expect(result.overdueTasks[0].reason).toBe('Overdue');
  });

  it('never marks an overdue task complete or changes its date', () => {
    const original = task({ id: 't1-coverage', date: '2026-01-06' });
    const tasks = [original];
    computeDailyStudyQueue(input({ plan: buildPlan(tasks) }));
    expect(original.status).toBe('pending');
    expect(original.date).toBe('2026-01-06');
  });
});

// --- 7-8: personal tasks stay separate --------------------------------------------------------
describe('computeDailyStudyQueue — personal tasks', () => {
  it('keeps personal tasks structurally separate with source "personal" and no topicId', () => {
    const result = assertActive(computeDailyStudyQueue(input({ plan: buildPlan([task()]), personalTasks: [personalTask({ id: 'p1', date: CURRENT_DATE })] })));
    const personalItem = result.todayPending.find((i) => i.source === 'personal');
    expect(personalItem).toBeDefined();
    expect('topicId' in personalItem!.task).toBe(false);
    expect(personalItem!.reason).toBe('Personal task');
  });

  it('personal tasks never affect syllabus coverage or topic status', () => {
    const withoutPersonal = assertActive(computeDailyStudyQueue(input({ plan: buildPlan([task({ date: '2026-01-06' })]) })));
    const withPersonal = assertActive(
      computeDailyStudyQueue(input({ plan: buildPlan([task({ date: '2026-01-06' })]), personalTasks: [personalTask({ date: CURRENT_DATE, estimatedMinutes: 500 })] })),
    );
    // The syllabus-derived overdue item's reason/priority is identical regardless of personal tasks.
    expect(withPersonal.overdueTasks[0].reason).toBe(withoutPersonal.overdueTasks[0].reason);
    expect(withPersonal.overdueTasks[0].priority).toBe(withoutPersonal.overdueTasks[0].priority);
  });
});

// --- 9-10: today's capacity ----------------------------------------------------------------------
describe('computeDailyStudyQueue — capacity', () => {
  it("computes today's planned/completed/remaining minutes and utilization", () => {
    const tasks = [task({ id: 't1-coverage', date: CURRENT_DATE, estimatedMinutes: 30, status: 'completed' }), task({ id: 't2-coverage', topicId: 't2', date: CURRENT_DATE, estimatedMinutes: 20 })];
    const result = assertActive(computeDailyStudyQueue(input({ plan: buildPlan(tasks) })));
    expect(result.capacity.configuredMinutes).toBe(60);
    expect(result.capacity.plannedMinutes).toBe(50);
    expect(result.capacity.completedMinutes).toBe(30);
    expect(result.capacity.remainingMinutes).toBe(20);
    expect(result.capacity.utilizationPct).toBeCloseTo((50 / 60) * 100, 1);
    expect(result.capacity.overCapacity).toBe(false);
  });

  it('detects an over-capacity day', () => {
    const tasks = [task({ id: 't1-coverage', date: CURRENT_DATE, estimatedMinutes: 90 })];
    const result = assertActive(computeDailyStudyQueue(input({ plan: buildPlan(tasks) })));
    expect(result.capacity.overCapacity).toBe(true);
    expect(result.capacity.plannedMinutes).toBeGreaterThan(result.capacity.configuredMinutes);
  });
});

// --- 11-12: empty today / next up -----------------------------------------------------------------
describe('computeDailyStudyQueue — empty today and next up', () => {
  it('reports no_tasks_scheduled when today is a study day but nothing is scheduled, with upcoming work in nextUp', () => {
    const tasks = [task({ id: 't2-coverage', topicId: 't2', date: '2026-01-09' })];
    const result = assertActive(computeDailyStudyQueue(input({ plan: buildPlan(tasks) })));
    expect(result.todayState).toBe('no_tasks_scheduled');
    expect(result.isStudyDay).toBe(true);
    expect(result.nextUp.length).toBeGreaterThan(0);
    expect(result.nextUp[0].task.id).toBe('t2-coverage');
  });

  it('caps nextUp at MAX_NEXT_UP items', () => {
    const tasks = [
      task({ id: 't1-coverage', topicId: 't1', date: '2026-01-09' }),
      task({ id: 't2-coverage', topicId: 't2', date: '2026-01-10' }),
      task({ id: 't3-coverage', topicId: 't3', date: '2026-01-12' }),
      task({ id: 't4-coverage', topicId: 't4', subjectId: 'subj-b', date: '2026-01-13' }),
      task({ id: 't1-revision', topicId: 't1', taskType: 'revision', date: '2026-01-14' }),
      task({ id: 't2-revision', topicId: 't2', taskType: 'revision', date: '2026-01-14' }),
    ];
    const result = assertActive(computeDailyStudyQueue(input({ plan: buildPlan(tasks) })));
    expect(result.nextUp.length).toBeLessThanOrEqual(MAX_NEXT_UP);
  });
});

// --- 13-15: task-type priority / reasons -----------------------------------------------------------
describe('computeDailyStudyQueue — priority and reasons by task type', () => {
  it('a coverage task is reasoned "Needs syllabus coverage" and ranks before revision/practice', () => {
    const tasks = [
      task({ id: 't1-coverage', taskType: 'coverage', date: CURRENT_DATE }),
      task({ id: 't2-revision', topicId: 't2', taskType: 'revision', date: CURRENT_DATE }),
      task({ id: 't3-practice', topicId: 't3', taskType: 'pyq_practice', date: CURRENT_DATE }),
    ];
    const result = assertActive(computeDailyStudyQueue(input({ plan: buildPlan(tasks) })));
    const coverageItem = result.todayPending.find((i) => i.task.id === 't1-coverage')!;
    expect(coverageItem.reason).toBe('Needs syllabus coverage');
    expect(result.todayPending[0].task.id).toBe('t1-coverage'); // ranks first
  });

  it('a revision task is reasoned "Needs revision" without weak PYQ data, and ranks after coverage', () => {
    const tasks = [task({ id: 't1-coverage', taskType: 'coverage', date: CURRENT_DATE }), task({ id: 't2-revision', topicId: 't2', taskType: 'revision', date: CURRENT_DATE })];
    const result = assertActive(computeDailyStudyQueue(input({ plan: buildPlan(tasks) })));
    const revisionItem = result.todayPending.find((i) => i.task.id === 't2-revision')!;
    expect(revisionItem.reason).toBe('Needs revision');
    expect(result.todayPending.findIndex((i) => i.task.id === 't1-coverage')).toBeLessThan(result.todayPending.findIndex((i) => i.task.id === 't2-revision'));
  });

  it('a revision task on a topic with real weak PYQ data is reasoned "Weak PYQ performance"', () => {
    const tasks = [task({ id: 't1-revision', topicId: 't1', taskType: 'revision', date: CURRENT_DATE })];
    const result = assertActive(computeDailyStudyQueue(input({ plan: buildPlan(tasks), pyqPerf: weakPerf })));
    expect(result.todayPending[0].reason).toBe('Weak PYQ performance');
  });

  it('a practice task is reasoned "Needs practice" and ranks after revision', () => {
    const tasks = [task({ id: 't2-revision', topicId: 't2', taskType: 'revision', date: CURRENT_DATE }), task({ id: 't3-practice', topicId: 't3', taskType: 'pyq_practice', date: CURRENT_DATE })];
    const result = assertActive(computeDailyStudyQueue(input({ plan: buildPlan(tasks) })));
    const practiceItem = result.todayPending.find((i) => i.task.id === 't3-practice')!;
    expect(practiceItem.reason).toBe('Needs practice');
    expect(result.todayPending.findIndex((i) => i.task.id === 't2-revision')).toBeLessThan(result.todayPending.findIndex((i) => i.task.id === 't3-practice'));
  });
});

// --- 16-19: exclusion / determinism / no-mutation --------------------------------------------------
describe('computeDailyStudyQueue — correctness invariants', () => {
  it('never includes a completed task in todayPending, overdueTasks, or nextUp', () => {
    const tasks = [
      task({ id: 't1-coverage', date: '2026-01-06', status: 'completed' }),
      task({ id: 't2-coverage', topicId: 't2', date: CURRENT_DATE, status: 'completed' }),
      task({ id: 't3-coverage', topicId: 't3', date: '2026-01-09', status: 'completed' }),
      task({ id: 't4-coverage', topicId: 't4', subjectId: 'subj-b', date: '2026-01-10' }), // keep the plan open
    ];
    const result = assertActive(computeDailyStudyQueue(input({ plan: buildPlan(tasks) })));
    const allIds = [...result.todayPending, ...result.overdueTasks, ...result.nextUp].map((i) => i.task.id);
    expect(allIds).not.toContain('t1-coverage');
    expect(allIds).not.toContain('t2-coverage');
    expect(allIds).not.toContain('t3-coverage');
  });

  it('produces identical output for identical input', () => {
    const tasks = [task({ id: 't1-coverage', date: '2026-01-06' }), task({ id: 't2-coverage', topicId: 't2', date: CURRENT_DATE })];
    const i = input({ plan: buildPlan(tasks), personalTasks: [personalTask()] });
    expect(computeDailyStudyQueue(i)).toEqual(computeDailyStudyQueue(i));
  });

  it('produces no duplicate ids within recommendedOrder', () => {
    const tasks = [task({ id: 't1-coverage', date: '2026-01-06' }), task({ id: 't2-coverage', topicId: 't2', date: CURRENT_DATE })];
    const result = assertActive(computeDailyStudyQueue(input({ plan: buildPlan(tasks), personalTasks: [personalTask({ id: 'p1', date: CURRENT_DATE })] })));
    const ids = result.recommendedOrder.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not mutate the input plan, its tasks, or personalTasks', () => {
    const tasks = [task({ id: 't1-coverage', date: '2026-01-06' })];
    const pTasks = [personalTask({ id: 'p1', date: CURRENT_DATE })];
    const plan = buildPlan(tasks);
    const i = input({ plan, personalTasks: pTasks });
    computeDailyStudyQueue(i);
    expect(i.plan).toBe(plan);
    expect(i.plan!.tasks).toBe(tasks);
    expect(i.personalTasks).toBe(pTasks);
    expect(tasks[0].status).toBe('pending');
  });
});

// --- Plan-completed state -------------------------------------------------------------------------
describe('computeDailyStudyQueue — plan completed', () => {
  it('reports status plan_completed when no pending work remains anywhere', () => {
    const tasks = [task({ id: 't1-coverage', date: '2026-01-06', status: 'completed' })];
    const result = computeDailyStudyQueue(input({ plan: buildPlan(tasks) }));
    expect(result.status).toBe('plan_completed');
  });

  it('reports status plan_completed for a brand-new plan with zero tasks', () => {
    const result = computeDailyStudyQueue(input({ plan: buildPlan([]) }));
    expect(result.status).toBe('plan_completed');
  });
});
