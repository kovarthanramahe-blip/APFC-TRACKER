import { describe, it, expect } from 'vitest';
import { adaptStudyPlan, computeRemainingCapacity, computeUnscheduledTopicIds, type AdaptiveInput } from './studyPlanAdaptive';
import { completeStudyPlanTask, moveStudyPlanTask, type PersonalPlanTask } from './studyPlanEditing';
import { generateStudyPlan, type PlanCapacity, type StudyPlan, type StudyPlanConfig, type StudyPlanTask } from './studyPlan';
import { computePyqPerformance } from './pyqPerformance';
import { SYLLABUS, getAllTopicsCount } from '../data/syllabus';
import type { SyllabusSubject, PYQ, PYQAttempt } from './types';

// Synthetic fixture syllabus/bank — independent of real data, so these tests exercise the
// adaptive logic itself rather than being fragile to the real dataset's shape.
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

// Study days: Mon 05 - Wed 14 Jan (skipping the Sun 11), 10 days total, 60 min/day.
const capacity: PlanCapacity = {
  totalCalendarDays: 10,
  studyWeekdays: [1, 2, 3, 4, 5, 6],
  studyDayDates: ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-12', '2026-01-13', '2026-01-14'],
  minutesPerStudyDay: 60,
  totalAvailableMinutes: 9 * 60,
  plannableMinutes: Math.floor(9 * 60 * 0.85),
};
const CURRENT_DATE = '2026-01-08'; // Jan 5, 6, 7 are "the past" for these tests.

function task(overrides: Partial<StudyPlanTask> = {}): StudyPlanTask {
  return {
    id: overrides.id ?? 't1-coverage',
    date: overrides.date ?? '2026-01-08',
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
    date: overrides.date ?? '2026-01-08',
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

function input(overrides: Partial<AdaptiveInput>): AdaptiveInput {
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

// Real PYQ fixtures for building strong/weak pyqPerf snapshots for t1.
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
const strongPerf = computePyqPerformance(
  bank,
  [attempt({ questionIds: ['t1-q0', 't1-q1', 't1-q2'], answers: { 't1-q0': 't1-q0-o0', 't1-q1': 't1-q1-o0', 't1-q2': 't1-q2-o0' }, correctCount: 3 })],
);
const weakPerf = computePyqPerformance(
  bank,
  [attempt({ questionIds: ['t1-q0', 't1-q1', 't1-q2'], answers: { 't1-q0': 't1-q0-o1', 't1-q1': 't1-q1-o1', 't1-q2': 't1-q2-o0' }, correctCount: 1, wrongCount: 2 })],
);

// --- 1: no progress change -> no unnecessary changes -------------------------
describe('adaptStudyPlan — stability', () => {
  it('makes no changes when nothing about progress has changed', () => {
    const t = task({ id: 't1-coverage', topicId: 't1', date: '2026-01-09' });
    const result = adaptStudyPlan(input({ plan: buildPlan([t]), completedTopics: {}, pyqPerf: null }));
    expect(result.removedTaskIds).toEqual([]);
    expect(result.addedTaskIds).toEqual([]);
    expect(result.movedTaskIds).toEqual([]);
    expect(result.unchangedTaskIds).toEqual(['t1-coverage']);
    expect(result.changes).toEqual([]);
  });

  it('is deterministic: identical input always produces identical output', () => {
    const t = task({ id: 't1-coverage', topicId: 't1', date: '2026-01-05' }); // a "missed" task too
    const i = input({ plan: buildPlan([t]), completedTopics: { t1: true }, pyqPerf: weakPerf });
    expect(adaptStudyPlan(i)).toEqual(adaptStudyPlan(i));
  });
});

// --- 2, 4: completed/strong topics ---------------------------------------------
describe('adaptStudyPlan — completed and strong topics', () => {
  it('a completed topic with strong PYQ performance removes its future coverage task entirely', () => {
    const t = task({ id: 't1-coverage', topicId: 't1', date: '2026-01-09' });
    const result = adaptStudyPlan(input({ plan: buildPlan([t]), completedTopics: { t1: true }, pyqPerf: strongPerf }));
    expect(result.removedTaskIds).toEqual(['t1-coverage']);
    expect(result.addedTaskIds).toEqual([]);
    expect(result.updatedTasks.find((x) => x.id === 't1-coverage')).toBeUndefined();
    expect(result.changes[0].reason).toBe('Topic completed — future coverage removed.');
  });

  it('a strong topic that already has a completed coverage task does not receive excessive new revision', () => {
    const completedCoverage = task({ id: 't1-coverage', topicId: 't1', date: '2026-01-06', status: 'completed' });
    const result = adaptStudyPlan(input({ plan: buildPlan([completedCoverage]), completedTopics: { t1: true }, pyqPerf: strongPerf }));
    expect(result.addedTaskIds).toEqual([]);
    expect(result.removedTaskIds).toEqual([]);
  });
});

// --- 3: newly weak topic ------------------------------------------------------
describe('adaptStudyPlan — newly weak topic', () => {
  it('adds revision workload for a covered topic whose PYQ accuracy has become weak', () => {
    const completedCoverage = task({ id: 't1-coverage', topicId: 't1', date: '2026-01-06', status: 'completed' });
    const result = adaptStudyPlan(input({ plan: buildPlan([completedCoverage]), completedTopics: { t1: true }, pyqPerf: weakPerf }));
    expect(result.addedTaskIds).toEqual(['t1-revision']);
    const added = result.updatedTasks.find((t) => t.id === 't1-revision')!;
    expect(added.taskType).toBe('revision');
    expect(added.status).toBe('pending');
    expect(result.changes.find((c) => c.taskId === 't1-revision')?.reason).toBe('PYQ accuracy dropped — additional revision added.');
  });
});

// --- 5, 6, 14: completed tasks protected ---------------------------------------
describe('adaptStudyPlan — completed tasks are fixed', () => {
  it('a completed syllabus task is returned completely unchanged, whatever else changes', () => {
    const completedTask = task({ id: 't1-coverage', topicId: 't1', date: '2026-01-03', status: 'completed', estimatedMinutes: 50 });
    const otherPending = task({ id: 't2-coverage', topicId: 't2', date: '2026-01-09', estimatedMinutes: 240 }); // will overload capacity
    const result = adaptStudyPlan(input({ plan: buildPlan([completedTask, otherPending]) }));
    expect(result.updatedTasks.find((t) => t.id === 't1-coverage')).toEqual(completedTask);
  });

  it('only pending tasks ever move — a completed task keeps its exact original date', () => {
    const completedTask = task({ id: 't1-coverage', topicId: 't1', date: '2026-01-03', status: 'completed' });
    const result = adaptStudyPlan(input({ plan: buildPlan([completedTask]) }));
    expect(result.updatedTasks.find((t) => t.id === 't1-coverage')?.date).toBe('2026-01-03');
    expect(result.completedTaskIds).toEqual(['t1-coverage']);
  });

  it('a completed personal task does not affect the function at all and is excluded from remaining planned minutes', () => {
    const completedPersonal = personalTask({ id: 'p1', status: 'completed', estimatedMinutes: 30 });
    const before = JSON.parse(JSON.stringify(completedPersonal));
    const report = computeRemainingCapacity(capacity, CURRENT_DATE, [], [completedPersonal]);
    expect(completedPersonal).toEqual(before); // never mutated
    expect(report.remainingPlannedMinutes).toBe(0); // completed work isn't "remaining"
  });
});

// --- 7: pending personal tasks stay separate -----------------------------------
describe('adaptStudyPlan — personal tasks', () => {
  it('pending personal tasks are never part of updatedTasks (syllabus tasks), but do count toward remaining planned minutes', () => {
    const t = task({ id: 't1-coverage', topicId: 't1', date: '2026-01-09' });
    const p = personalTask({ id: 'p1', estimatedMinutes: 20, date: '2026-01-09' });
    const result = adaptStudyPlan(input({ plan: buildPlan([t]), personalTasks: [p] }));
    expect(result.updatedTasks.some((x) => x.id === 'p1')).toBe(false);
    expect(result.updatedTasks.every((x) => (x as unknown as { taskType: string }).taskType !== 'personal')).toBe(true);
    expect(result.capacityReport.remainingPlannedMinutes).toBeGreaterThanOrEqual(20);
  });

  it('a personal task never has a topicId or subjectId', () => {
    const p = personalTask() as PersonalPlanTask & { topicId?: unknown; subjectId?: unknown };
    expect('topicId' in p).toBe(false);
    expect('subjectId' in p).toBe(false);
  });
});

// --- 8, 9: missed tasks ----------------------------------------------------------
describe('adaptStudyPlan — missed (overdue) tasks', () => {
  it('a missed pending task is never automatically marked completed', () => {
    const missed = task({ id: 't1-coverage', topicId: 't1', date: '2026-01-05' }); // before CURRENT_DATE
    const result = adaptStudyPlan(input({ plan: buildPlan([missed]) }));
    expect(result.missedTaskIds).toEqual(['t1-coverage']);
    expect(result.updatedTasks.find((t) => t.id === 't1-coverage')?.status).toBe('pending');
  });

  it('a missed task is rebalanced forward to the next available study day at or after currentDate', () => {
    const missed = task({ id: 't1-coverage', topicId: 't1', date: '2026-01-05' });
    const result = adaptStudyPlan(input({ plan: buildPlan([missed]) }));
    const moved = result.updatedTasks.find((t) => t.id === 't1-coverage')!;
    expect(moved.date >= CURRENT_DATE).toBe(true);
    expect(result.movedTaskIds).toContain('t1-coverage');
    expect(result.changes.find((c) => c.taskId === 't1-coverage')?.reason).toBe('Task missed — moved to the next available study day.');
  });
});

// --- 10, 11: capacity -------------------------------------------------------------
describe('computeRemainingCapacity', () => {
  it('calculates remaining study days and minutes correctly', () => {
    // From CURRENT_DATE (2026-01-08) onward: 08, 09, 10, 12, 13, 14 = 6 study days x 60 = 360 min.
    const report = computeRemainingCapacity(capacity, CURRENT_DATE, [], []);
    expect(report.remainingStudyDays).toBe(6);
    expect(report.remainingAvailableMinutes).toBe(360);
    expect(report.remainingPlannedMinutes).toBe(0);
    expect(report.verdict).toBe('completed');
  });

  it('detects over-capacity honestly, without inflating configured daily hours', () => {
    const heavy = [task({ id: 't1-coverage', estimatedMinutes: 600 })];
    const report = computeRemainingCapacity(capacity, CURRENT_DATE, heavy, []);
    expect(report.verdict).toBe('over_capacity');
    expect(report.remainingDeficitMinutes).toBeGreaterThan(0);
    expect(report.message.length).toBeGreaterThan(0);
  });

  it('never produces NaN, Infinity, or negative numbers', () => {
    for (const tasks of [[], [task({ estimatedMinutes: 1 })]]) {
      const report = computeRemainingCapacity(capacity, CURRENT_DATE, tasks, []);
      for (const n of [report.remainingAvailableMinutes, report.remainingPlannedMinutes, report.remainingDeficitMinutes, report.remainingSurplusMinutes, report.utilizationPct]) {
        expect(Number.isFinite(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// --- 12, 13: date bounds -----------------------------------------------------------
describe('adaptStudyPlan — date bounds', () => {
  it('never schedules a task beyond the target date', () => {
    const tasks = Array.from({ length: 6 }, (_, i) => task({ id: `t${i}-coverage`, topicId: `t${i}`, date: '2026-01-08', estimatedMinutes: 50 }));
    const result = adaptStudyPlan(input({ plan: buildPlan(tasks) }));
    const lastDate = capacity.studyDayDates[capacity.studyDayDates.length - 1];
    for (const t of result.updatedTasks) expect(t.date <= lastDate).toBe(true);
  });

  it('never schedules a pending task before currentDate', () => {
    const missed = task({ id: 't1-coverage', topicId: 't1', date: '2026-01-05' });
    const result = adaptStudyPlan(input({ plan: buildPlan([missed]) }));
    for (const t of result.updatedTasks.filter((x) => x.status === 'pending')) {
      expect(t.date >= CURRENT_DATE).toBe(true);
    }
  });
});

// --- 15: no duplicates -------------------------------------------------------------
describe('adaptStudyPlan — no duplicate task ids', () => {
  it('produces a unique set of task ids even after several add/remove operations', () => {
    const completedCoverage = task({ id: 't1-coverage', topicId: 't1', date: '2026-01-06', status: 'completed' });
    const staleCoverage = task({ id: 't2-coverage', topicId: 't2', date: '2026-01-09' });
    const result = adaptStudyPlan(
      input({
        plan: buildPlan([completedCoverage, staleCoverage]),
        completedTopics: { t1: true, t2: true },
        pyqPerf: weakPerf, // only t1 has PYQ data in this bank; t2 will resolve to needs_practice
      }),
    );
    const ids = result.updatedTasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// --- 19: Stage 3 compatibility ------------------------------------------------------
describe('adaptStudyPlan — Stage 3 compatibility', () => {
  it('output tasks remain fully usable by Stage 3 editing functions', () => {
    const t = task({ id: 't1-coverage', topicId: 't1', date: '2026-01-09' });
    const result = adaptStudyPlan(input({ plan: buildPlan([t]) }));
    const completeResult = completeStudyPlanTask(result.updatedTasks, 't1-coverage');
    expect(completeResult.ok).toBe(true);
    const moveResult = moveStudyPlanTask(result.updatedTasks, 't1-coverage', '2026-01-10', { validStudyDates: capacity.studyDayDates });
    expect(moveResult.ok).toBe(true);
  });
});

// --- P1 fix #1: unscheduled topics never go stale after Rebalance/Adapt --------------------
describe('computeUnscheduledTopicIds', () => {
  it('flags a topic that needs coverage but has no task at all', () => {
    const ids = computeUnscheduledTopicIds([], syllabus, {}, null);
    expect(ids).toContain('t1');
  });

  it('does not flag a topic that already has a pending task matching its current need', () => {
    const t = task({ id: 't1-coverage', topicId: 't1', taskType: 'coverage' });
    const ids = computeUnscheduledTopicIds([t], syllabus, {}, null);
    expect(ids).not.toContain('t1');
  });

  it('does not flag a topic whose matching task is already completed', () => {
    const t = task({ id: 't1-coverage', topicId: 't1', taskType: 'coverage', status: 'completed' });
    const ids = computeUnscheduledTopicIds([t], syllabus, { t1: true }, strongPerf);
    expect(ids).not.toContain('t1');
  });

  it('never flags a strong topic, even with zero tasks', () => {
    const ids = computeUnscheduledTopicIds([], syllabus, { t1: true }, strongPerf);
    expect(ids).not.toContain('t1');
  });

  it('flags a topic whose only existing task no longer matches what it currently needs', () => {
    // t1 has an old pyq_practice task, but its current (weak) PYQ performance actually needs revision.
    const stale = task({ id: 't1-practice', topicId: 't1', taskType: 'pyq_practice' });
    const ids = computeUnscheduledTopicIds([stale], syllabus, { t1: true }, weakPerf);
    expect(ids).toContain('t1');
  });
});

describe('adaptStudyPlan — unscheduledTopicIds is recomputed live, never stale', () => {
  it('a topic flagged unscheduled against the ORIGINAL tasks is no longer flagged after Adapt fixes it', () => {
    // Reproduces the exact staleness the audit found: t1's only existing task (pyq_practice) no
    // longer matches what its current (weak) PYQ performance needs (revision).
    const stale = task({ id: 't1-practice', topicId: 't1', taskType: 'pyq_practice', date: '2026-01-09' });
    const i = input({ plan: buildPlan([stale]), completedTopics: { t1: true }, pyqPerf: weakPerf });

    // Before: computed straight off the plan's original (frozen-shape) task list, t1 IS unscheduled.
    const before = computeUnscheduledTopicIds(i.plan.tasks, syllabus, i.completedTopics, i.pyqPerf);
    expect(before).toContain('t1');

    // After running Adapt, the returned unscheduledTopicIds reflects the NEW task list — t1 is fixed.
    const result = adaptStudyPlan(i);
    expect(result.addedTaskIds).toContain('t1-revision');
    expect(result.unscheduledTopicIds).not.toContain('t1');
  });

  it('a topic that becomes strong is never reported as unscheduled after Adapt', () => {
    const t = task({ id: 't1-coverage', topicId: 't1', taskType: 'coverage', date: '2026-01-09' });
    const result = adaptStudyPlan(input({ plan: buildPlan([t]), completedTopics: { t1: true }, pyqPerf: strongPerf }));
    expect(result.removedTaskIds).toEqual(['t1-coverage']);
    expect(result.unscheduledTopicIds).not.toContain('t1');
  });

  it('is deterministic: identical input always produces an identical unscheduledTopicIds', () => {
    const t = task({ id: 't1-practice', topicId: 't1', taskType: 'pyq_practice' });
    const i = input({ plan: buildPlan([t]), completedTopics: { t1: true }, pyqPerf: weakPerf });
    expect(adaptStudyPlan(i).unscheduledTopicIds).toEqual(adaptStudyPlan(i).unscheduledTopicIds);
  });
});

// --- Real syllabus/PYQ_BANK end-to-end ------------------------------------------------
describe('adaptStudyPlan — real APFC syllabus data', () => {
  it('runs successfully end-to-end against a real generated plan', () => {
    const config: StudyPlanConfig = { startDate: '2026-01-01', targetDate: '2026-12-20', studyDaysPerWeek: 6, hoursPerStudyDay: 3 };
    const generated = generateStudyPlan({ config, syllabus: SYLLABUS, completedTopics: {}, pyqPerf: null });
    if (!generated.ok) throw new Error('expected ok plan');
    const result = adaptStudyPlan(
      input({ plan: generated.plan, syllabus: SYLLABUS, completedTopics: {}, pyqPerf: null, currentDate: '2026-01-01' }),
    );
    expect(result.updatedTasks.length).toBeGreaterThan(0);
    // Coverage is still fully represented — adaptive logic never drops a touched topic silently.
    const touchedBefore = new Set(generated.plan.tasks.map((t) => t.topicId));
    const touchedAfter = new Set(result.updatedTasks.map((t) => t.topicId));
    for (const id of touchedBefore) {
      // Either still present, or explicitly reported as removed (topic became strong/changed type).
      expect(touchedAfter.has(id) || result.removedTaskIds.some((rid) => rid.startsWith(id))).toBe(true);
    }
    expect(getAllTopicsCount()).toBeGreaterThan(0);
  });
});
