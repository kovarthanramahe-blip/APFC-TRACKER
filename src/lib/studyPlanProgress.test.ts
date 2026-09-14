import { describe, it, expect } from 'vitest';
import { computeStudyPlanProgress, EXECUTION_TOLERANCE_PCT, type StudyPlanProgressInput } from './studyPlanProgress';
import type { PersonalPlanTask } from './studyPlanEditing';
import type { PlanCapacity, StudyPlan, StudyPlanTask } from './studyPlan';
import type { PomodoroSession } from './types';

// Fixtures mirror the conventions established in studyPlanHealth.test.ts / studyPlanScenarios.test.ts
// / studyPlanDailyQueue.test.ts.
const capacity: PlanCapacity = {
  totalCalendarDays: 10,
  studyWeekdays: [1, 2, 3, 4, 5, 6],
  studyDayDates: ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-12', '2026-01-13', '2026-01-14'],
  minutesPerStudyDay: 60,
  totalAvailableMinutes: 9 * 60,
  plannableMinutes: Math.floor(9 * 60 * 0.85),
};
const CURRENT_DATE = '2026-01-08'; // 05,06,07 are "the past"; 08 is today; 09,10,12,13,14 are upcoming.

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

function sessionOn(date: string, durationMinutes: number, mode: PomodoroSession['mode'] = 'focus', subject: PomodoroSession['subject'] = 'english'): PomodoroSession {
  return {
    id: `s-${date}-${mode}-${durationMinutes}`,
    mode,
    subject,
    startedAt: `${date}T09:00:00.000Z`,
    completedAt: `${date}T09:${String(durationMinutes).padStart(2, '0')}:00.000Z`,
    durationMinutes,
    completedFully: true,
  };
}

function buildPlan(tasks: StudyPlanTask[], configOverrides: Partial<StudyPlan['config']> = {}): StudyPlan {
  return {
    config: { startDate: '2026-01-05', targetDate: '2026-01-14', studyDaysPerWeek: 6, hoursPerStudyDay: 1, ...configOverrides },
    capacity,
    capacityReport: { availableMinutes: capacity.plannableMinutes, rawAvailableMinutes: capacity.totalAvailableMinutes, requiredMinutes: 0, deficitMinutes: 0, verdict: 'comfortable', message: '' },
    coverageSummary: { totalTopics: 4, strong: 0, needsCoverage: 0, needsRevision: 0, needsPractice: 0 },
    phases: [{ id: 'focused', title: 'Focused Prep', startDate: '2026-01-05', endDate: '2026-01-14', focus: '' }],
    tasks,
    unscheduledTopicIds: [],
  };
}

function input(overrides: Partial<StudyPlanProgressInput> = {}): StudyPlanProgressInput {
  return {
    plan: buildPlan([]),
    personalTasks: [],
    sessions: [],
    currentDate: CURRENT_DATE,
    ...overrides,
  };
}

function assertReady(result: ReturnType<typeof computeStudyPlanProgress>) {
  if (result.status !== 'ready') throw new Error(`expected status 'ready', got '${result.status}'`);
  return result;
}

// The main multi-task fixture reused across tests 4-6, 12-15, and 17 (on-track).
const mainTasks = [
  task({ id: 't1-coverage', topicId: 't1', subjectId: 'subj-a', taskType: 'coverage', date: '2026-01-05', estimatedMinutes: 50, status: 'completed' }),
  task({ id: 't2-coverage', topicId: 't2', subjectId: 'subj-a', taskType: 'coverage', date: '2026-01-06', estimatedMinutes: 50, status: 'pending' }),
  task({ id: 't3-revision', topicId: 't3', subjectId: 'subj-a', taskType: 'revision', date: CURRENT_DATE, estimatedMinutes: 25, status: 'pending' }),
  task({ id: 't4-practice', topicId: 't4', subjectId: 'subj-b', taskType: 'pyq_practice', date: '2026-01-09', estimatedMinutes: 25, status: 'pending' }),
];
const mainSessions = [sessionOn('2026-01-06', 30, 'focus'), sessionOn('2026-01-08', 20, 'focus'), sessionOn('2026-01-07', 10, 'shortBreak')];

// --- 1: no plan -------------------------------------------------------------------------------
describe('computeStudyPlanProgress — no plan', () => {
  it('reports status no_plan when no plan has been generated', () => {
    const result = computeStudyPlanProgress(input({ plan: null }));
    expect(result.status).toBe('no_plan');
  });
});

// --- 2-3: completion states --------------------------------------------------------------------
describe('computeStudyPlanProgress — completion states', () => {
  it('a fully completed plan reports 100% task completion and zero pending', () => {
    const tasks = [task({ id: 't1-coverage', status: 'completed' }), task({ id: 't2-coverage', topicId: 't2', status: 'completed' })];
    const result = assertReady(computeStudyPlanProgress(input({ plan: buildPlan(tasks) })));
    expect(result.taskCompletion.completionPct).toBe(100);
    expect(result.taskCompletion.pending).toBe(0);
  });

  it('a partially completed plan reports a completion percentage strictly between 0 and 100', () => {
    const result = assertReady(computeStudyPlanProgress(input({ plan: buildPlan(mainTasks) })));
    expect(result.taskCompletion.completionPct).toBeGreaterThan(0);
    expect(result.taskCompletion.completionPct).toBeLessThan(100);
  });
});

// --- 4-7: task/minutes completion math -----------------------------------------------------------
describe('computeStudyPlanProgress — completion math', () => {
  it('computes the exact task completion percentage', () => {
    const result = assertReady(computeStudyPlanProgress(input({ plan: buildPlan(mainTasks) })));
    expect(result.taskCompletion.planned).toBe(4);
    expect(result.taskCompletion.completed).toBe(1);
    expect(result.taskCompletion.completionPct).toBe(25);
  });

  it('computes total planned minutes', () => {
    const result = assertReady(computeStudyPlanProgress(input({ plan: buildPlan(mainTasks) })));
    expect(result.plannedMinutes.plannedMinutes).toBe(150); // 50+50+25+25
  });

  it('computes completed planned minutes', () => {
    const result = assertReady(computeStudyPlanProgress(input({ plan: buildPlan(mainTasks) })));
    expect(result.plannedMinutes.completedMinutes).toBe(50); // only t1-coverage
  });

  it('computes remaining planned minutes', () => {
    const result = assertReady(computeStudyPlanProgress(input({ plan: buildPlan(mainTasks) })));
    expect(result.plannedMinutes.remainingMinutes).toBe(100); // 150 - 50
  });
});

// --- 8-9: personal tasks stay separate --------------------------------------------------------
describe('computeStudyPlanProgress — personal tasks', () => {
  it('personal tasks are excluded from syllabus task/minutes completion', () => {
    const withoutPersonal = assertReady(computeStudyPlanProgress(input({ plan: buildPlan(mainTasks) })));
    const withPersonal = assertReady(
      computeStudyPlanProgress(input({ plan: buildPlan(mainTasks), personalTasks: [personalTask({ status: 'completed', estimatedMinutes: 999 })] })),
    );
    expect(withPersonal.taskCompletion).toEqual(withoutPersonal.taskCompletion);
    expect(withPersonal.plannedMinutes).toEqual(withoutPersonal.plannedMinutes);
  });

  it('personal tasks are reported in their own breakdown', () => {
    const result = assertReady(
      computeStudyPlanProgress(
        input({ plan: buildPlan(mainTasks), personalTasks: [personalTask({ id: 'p1', status: 'completed', estimatedMinutes: 30 }), personalTask({ id: 'p2', status: 'pending', estimatedMinutes: 20 })] }),
      ),
    );
    expect(result.personalTaskCompletion.planned).toBe(2);
    expect(result.personalTaskCompletion.completed).toBe(1);
    expect(result.personalMinutes.plannedMinutes).toBe(50);
    expect(result.personalMinutes.completedMinutes).toBe(30);
    expect(result.personalTaskTypeProgress.personal.planned).toBe(2);
  });
});

// --- 10-12: actual study time / planned vs actual -----------------------------------------------
describe('computeStudyPlanProgress — actual study time', () => {
  it('sums actual study minutes from focus sessions only, within the plan period so far', () => {
    const result = assertReady(computeStudyPlanProgress(input({ plan: buildPlan(mainTasks), sessions: mainSessions })));
    expect(result.actualStudyTime.actualStudyMinutes).toBe(50); // 30 + 20 focus minutes; the 10min shortBreak is excluded
  });

  it('counts actual study sessions correctly', () => {
    const result = assertReady(computeStudyPlanProgress(input({ plan: buildPlan(mainTasks), sessions: mainSessions })));
    expect(result.actualStudyTime.actualStudySessions).toBe(2);
  });

  it('compares planned-to-date minutes against actual study minutes', () => {
    const result = assertReady(computeStudyPlanProgress(input({ plan: buildPlan(mainTasks), sessions: mainSessions })));
    // Tasks dated on/before 2026-01-08: t1(50)+t2(50)+t3(25) = 125; t4 (01-09) is excluded.
    expect(result.plannedVsActual.plannedMinutesToDate).toBe(125);
    expect(result.plannedVsActual.actualStudyMinutes).toBe(50);
    expect(result.plannedVsActual.executionPercentage).toBe(40); // 50/125 * 100
    expect(result.plannedVsActual.surplusDeficitMinutes).toBe(-75);
  });
});

// --- 13: weekly aggregation ----------------------------------------------------------------------
describe('computeStudyPlanProgress — weekly aggregation', () => {
  it('buckets tasks and actual minutes into 7-day weeks anchored to the plan start date', () => {
    const result = assertReady(computeStudyPlanProgress(input({ plan: buildPlan(mainTasks), sessions: mainSessions })));
    expect(result.weeklyProgress).toHaveLength(2); // 2026-01-05..11, 2026-01-12..14
    expect(result.weeklyProgress[0].weekStart).toBe('2026-01-05');
    expect(result.weeklyProgress[0].weekEnd).toBe('2026-01-11');
    expect(result.weeklyProgress[0].plannedTaskCount).toBe(4); // all 4 tasks fall within week 1
    expect(result.weeklyProgress[0].plannedMinutes).toBe(150);
    expect(result.weeklyProgress[0].actualStudyMinutes).toBe(50);
    expect(result.weeklyProgress[1].weekStart).toBe('2026-01-12');
    expect(result.weeklyProgress[1].weekEnd).toBe('2026-01-14'); // clamped to targetDate
    expect(result.weeklyProgress[1].plannedTaskCount).toBe(0);
  });
});

// --- 14: subject aggregation ----------------------------------------------------------------------
describe('computeStudyPlanProgress — subject aggregation', () => {
  it('groups planned/completed minutes and counts by the tasks own subjectId', () => {
    const result = assertReady(computeStudyPlanProgress(input({ plan: buildPlan(mainTasks) })));
    const subjA = result.subjectProgress.find((s) => s.subjectId === 'subj-a')!;
    const subjB = result.subjectProgress.find((s) => s.subjectId === 'subj-b')!;
    expect(subjA.plannedTaskCount).toBe(3);
    expect(subjA.completedTaskCount).toBe(1);
    expect(subjA.plannedMinutes).toBe(125);
    expect(subjA.completedMinutes).toBe(50);
    expect(subjB.plannedTaskCount).toBe(1);
    expect(subjB.completedMinutes).toBe(0);
  });
});

// --- 15: task-type aggregation ---------------------------------------------------------------------
describe('computeStudyPlanProgress — task-type aggregation', () => {
  it('breaks down planned/completed counts and minutes by task type', () => {
    const result = assertReady(computeStudyPlanProgress(input({ plan: buildPlan(mainTasks) })));
    expect(result.taskTypeProgress.coverage.planned).toBe(2);
    expect(result.taskTypeProgress.coverage.completed).toBe(1);
    expect(result.taskTypeProgress.revision.planned).toBe(1);
    expect(result.taskTypeProgress.revision.completed).toBe(0);
    expect(result.taskTypeProgress.pyq_practice.planned).toBe(1);
    expect(result.taskTypeProgress.review.planned).toBe(0);
  });
});

// --- 16-19: execution states -----------------------------------------------------------------------
describe('computeStudyPlanProgress — execution states', () => {
  it('reports "ahead" when completed workload is substantially more than the elapsed plan period', () => {
    // Plan period 01-05..01-14 (10 days); today 01-08 => 40% elapsed. All planned work already done.
    const tasks = [task({ id: 't1-coverage', status: 'completed', estimatedMinutes: 50 })];
    const result = assertReady(computeStudyPlanProgress(input({ plan: buildPlan(tasks), sessions: [sessionOn(CURRENT_DATE, 25)] })));
    expect(result.planElapsedPct).toBe(40);
    expect(result.plannedMinutes.completionPct).toBe(100);
    expect(result.executionState).toBe('ahead');
  });

  it('reports "on_track" when completed workload roughly matches the elapsed plan period', () => {
    const result = assertReady(computeStudyPlanProgress(input({ plan: buildPlan(mainTasks), sessions: mainSessions })));
    // 40% elapsed vs 33.3% complete — within the documented tolerance.
    expect(Math.abs(result.plannedMinutes.completionPct - result.planElapsedPct)).toBeLessThanOrEqual(EXECUTION_TOLERANCE_PCT);
    expect(result.executionState).toBe('on_track');
  });

  it('reports "behind" when completed workload is substantially less than the elapsed plan period', () => {
    const tasks = [
      task({ id: 't1-coverage', status: 'pending', estimatedMinutes: 50 }),
      task({ id: 't2-coverage', topicId: 't2', status: 'pending', estimatedMinutes: 50 }),
      task({ id: 't3-revision', topicId: 't3', taskType: 'revision', status: 'pending', estimatedMinutes: 50 }),
    ];
    const result = assertReady(computeStudyPlanProgress(input({ plan: buildPlan(tasks), sessions: [sessionOn(CURRENT_DATE, 10)] })));
    expect(result.plannedMinutes.completionPct).toBe(0);
    expect(result.planElapsedPct).toBe(40);
    expect(result.executionState).toBe('behind');
  });

  it('reports "inactive" when no actual study activity has been recorded', () => {
    const result = assertReady(computeStudyPlanProgress(input({ plan: buildPlan(mainTasks), sessions: [] })));
    expect(result.actualStudyTime.actualStudyMinutes).toBe(0);
    expect(result.executionState).toBe('inactive');
  });
});

// --- 20: overdue ---------------------------------------------------------------------------------
describe('computeStudyPlanProgress — overdue', () => {
  it('counts overdue pending tasks and minutes, and completed-overdue tasks separately', () => {
    const tasks = [
      task({ id: 't1-coverage', date: '2026-01-06', status: 'pending', estimatedMinutes: 40 }),
      task({ id: 't2-coverage', topicId: 't2', date: '2026-01-06', status: 'completed', estimatedMinutes: 20 }),
      task({ id: 't3-revision', topicId: 't3', taskType: 'revision', date: CURRENT_DATE, status: 'pending', estimatedMinutes: 25 }),
    ];
    const result = assertReady(computeStudyPlanProgress(input({ plan: buildPlan(tasks) })));
    expect(result.overdue.overduePendingCount).toBe(1);
    expect(result.overdue.overdueMinutes).toBe(40);
    expect(result.overdue.completedOverdueCount).toBe(1);
  });
});

// --- 21-23: invariants -----------------------------------------------------------------------------
describe('computeStudyPlanProgress — invariants', () => {
  it('does not mutate the input plan, tasks, personalTasks, or sessions', () => {
    const plan = buildPlan(mainTasks);
    const pTasks = [personalTask()];
    const i = input({ plan, personalTasks: pTasks, sessions: mainSessions });
    computeStudyPlanProgress(i);
    expect(i.plan).toBe(plan);
    expect(i.plan!.tasks).toBe(mainTasks);
    expect(i.personalTasks).toBe(pTasks);
    expect(i.sessions).toBe(mainSessions);
    expect(mainTasks[0].status).toBe('completed'); // unchanged from fixture definition
  });

  it('produces identical output for identical input', () => {
    const i = input({ plan: buildPlan(mainTasks), sessions: mainSessions, personalTasks: [personalTask()] });
    expect(computeStudyPlanProgress(i)).toEqual(computeStudyPlanProgress(i));
  });

  it('never produces NaN, Infinity, or negative values where they should not occur', () => {
    const scenarios: StudyPlanProgressInput[] = [
      input({ plan: buildPlan([]) }),
      input({ plan: buildPlan(mainTasks), sessions: mainSessions }),
      input({ plan: buildPlan([task({ status: 'completed' })]), sessions: [sessionOn(CURRENT_DATE, 25)] }),
    ];
    for (const s of scenarios) {
      const result = assertReady(computeStudyPlanProgress(s));
      const nums = [
        result.taskCompletion.completionPct,
        result.plannedMinutes.plannedMinutes,
        result.plannedMinutes.completedMinutes,
        result.plannedMinutes.remainingMinutes,
        result.actualStudyTime.actualStudyMinutes,
        result.actualStudyTime.avgActualMinutesPerStudyDay,
        result.plannedVsActual.executionPercentage,
        result.planElapsedPct,
        result.overdue.overdueMinutes,
      ];
      for (const n of nums) {
        expect(Number.isFinite(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
