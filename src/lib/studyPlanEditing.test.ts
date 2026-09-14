import { describe, it, expect } from 'vitest';
import {
  updateStudyPlanTask,
  completeStudyPlanTask,
  reopenStudyPlanTask,
  moveStudyPlanTask,
  resizeStudyPlanTask,
  removeStudyPlanTask,
  addPersonalStudyPlanTask,
  rebalanceStudyPlan,
  computeEditedCapacity,
  planHasCompletedTasks,
  MAX_TASK_MINUTES,
  type PersonalPlanTask,
} from './studyPlanEditing';
import { generateStudyPlan, type PlanCapacity, type StudyPlanConfig, type StudyPlanTask } from './studyPlan';
import { computeUnifiedTopicStatus } from './topicStatus';
import { SYLLABUS } from '../data/syllabus';

function task(overrides: Partial<StudyPlanTask> = {}): StudyPlanTask {
  return {
    id: overrides.id ?? 't-1-coverage',
    date: overrides.date ?? '2026-01-05',
    topicId: overrides.topicId ?? 't-1',
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

// Mon-Sat, 60 min/day.
const capacity: PlanCapacity = {
  totalCalendarDays: 7,
  studyWeekdays: [1, 2, 3, 4, 5, 6],
  studyDayDates: ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10'],
  minutesPerStudyDay: 60,
  totalAvailableMinutes: 360,
  plannableMinutes: 306,
};

// --- updateStudyPlanTask (shared primitive) ----------------------------------
describe('updateStudyPlanTask', () => {
  it('patches only the matching task, leaving others untouched', () => {
    const tasks = [task({ id: 'a', estimatedMinutes: 50 }), task({ id: 'b', estimatedMinutes: 25 })];
    const result = updateStudyPlanTask(tasks, 'a', { estimatedMinutes: 40 });
    expect(result.ok).toBe(true);
    expect(result.tasks.find((t) => t.id === 'a')?.estimatedMinutes).toBe(40);
    expect(result.tasks.find((t) => t.id === 'b')?.estimatedMinutes).toBe(25);
  });

  it('reports an error for an unknown task id', () => {
    const result = updateStudyPlanTask([task({ id: 'a' })], 'missing', { estimatedMinutes: 10 });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// --- 1-2: complete / reopen ----------------------------------------------------
describe('completeStudyPlanTask / reopenStudyPlanTask', () => {
  it('marks a pending task completed while preserving date, topic, duration and identity', () => {
    const original = task({ id: 'a', date: '2026-01-06', topicId: 't-9', estimatedMinutes: 50 });
    const result = completeStudyPlanTask([original], 'a');
    expect(result.ok).toBe(true);
    const completed = result.tasks[0];
    expect(completed.status).toBe('completed');
    expect(completed.date).toBe(original.date);
    expect(completed.topicId).toBe(original.topicId);
    expect(completed.estimatedMinutes).toBe(original.estimatedMinutes);
    expect(completed.id).toBe(original.id);
  });

  it('reopens a completed task back to pending', () => {
    const result = reopenStudyPlanTask([task({ id: 'a', status: 'completed' })], 'a');
    expect(result.ok).toBe(true);
    expect(result.tasks[0].status).toBe('pending');
  });

  it('completing an already-completed task is a harmless no-op', () => {
    const result = completeStudyPlanTask([task({ id: 'a', status: 'completed' })], 'a');
    expect(result.ok).toBe(true);
    expect(result.tasks[0].status).toBe('completed');
  });
});

// --- 4-5: move -------------------------------------------------------------------
describe('moveStudyPlanTask', () => {
  it('moves a pending task to a new valid study date', () => {
    const result = moveStudyPlanTask([task({ id: 'a', date: '2026-01-05' })], 'a', '2026-01-08', {
      validStudyDates: capacity.studyDayDates,
    });
    expect(result.ok).toBe(true);
    expect(result.tasks[0].date).toBe('2026-01-08');
  });

  it('does not duplicate the task — array length and task count stay the same', () => {
    const tasks = [task({ id: 'a' }), task({ id: 'b', topicId: 't-2' })];
    const result = moveStudyPlanTask(tasks, 'a', '2026-01-09', { validStudyDates: capacity.studyDayDates });
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks.filter((t) => t.id === 'a')).toHaveLength(1);
  });

  it('rejects moving a completed task', () => {
    const result = moveStudyPlanTask([task({ id: 'a', status: 'completed' })], 'a', '2026-01-08', {
      validStudyDates: capacity.studyDayDates,
    });
    expect(result.ok).toBe(false);
    expect(result.tasks[0].date).toBe('2026-01-05'); // untouched
  });

  it('rejects a date that is not a configured study day', () => {
    const result = moveStudyPlanTask([task({ id: 'a' })], 'a', '2026-01-11', { validStudyDates: capacity.studyDayDates });
    expect(result.ok).toBe(false);
  });

  it('allows the move but warns when the destination day is already at capacity', () => {
    const tasks = [task({ id: 'a', date: '2026-01-05', estimatedMinutes: 50 }), task({ id: 'b', date: '2026-01-08', estimatedMinutes: 40, topicId: 't-2' })];
    const result = moveStudyPlanTask(tasks, 'a', '2026-01-08', { validStudyDates: capacity.studyDayDates, minutesPerStudyDay: 60 });
    expect(result.ok).toBe(true);
    expect(result.warning).toBeTruthy();
  });
});

// --- 6-7: resize -------------------------------------------------------------------
describe('resizeStudyPlanTask', () => {
  it('changes estimated minutes for a pending task', () => {
    const result = resizeStudyPlanTask([task({ id: 'a', estimatedMinutes: 50 })], 'a', 30);
    expect(result.ok).toBe(true);
    expect(result.tasks[0].estimatedMinutes).toBe(30);
  });

  it('rejects zero, negative, non-integer, and above-the-cap durations', () => {
    for (const bad of [0, -10, 12.5, MAX_TASK_MINUTES + 1]) {
      const result = resizeStudyPlanTask([task({ id: 'a' })], 'a', bad);
      expect(result.ok).toBe(false);
    }
  });

  it('does not silently alter other tasks', () => {
    const tasks = [task({ id: 'a', estimatedMinutes: 50 }), task({ id: 'b', estimatedMinutes: 25, topicId: 't-2' })];
    const result = resizeStudyPlanTask(tasks, 'a', 40);
    expect(result.tasks.find((t) => t.id === 'b')?.estimatedMinutes).toBe(25);
  });

  it('rejects resizing a completed task', () => {
    const result = resizeStudyPlanTask([task({ id: 'a', status: 'completed' })], 'a', 30);
    expect(result.ok).toBe(false);
  });

  it('surfaces (does not hide) an over-capacity day caused by the resize', () => {
    const tasks = [task({ id: 'a', date: '2026-01-05', estimatedMinutes: 50 })];
    const result = resizeStudyPlanTask(tasks, 'a', 90, 60);
    expect(result.ok).toBe(true);
    expect(result.warning).toBeTruthy();
  });
});

// --- 8-9: remove -------------------------------------------------------------------
describe('removeStudyPlanTask', () => {
  it('removes a pending task', () => {
    const result = removeStudyPlanTask([task({ id: 'a' }), task({ id: 'b', topicId: 't-2' })], 'a');
    expect(result.ok).toBe(true);
    expect(result.tasks.map((t) => t.id)).toEqual(['b']);
  });

  it('protects a completed task from removal', () => {
    const result = removeStudyPlanTask([task({ id: 'a', status: 'completed' })], 'a');
    expect(result.ok).toBe(false);
    expect(result.tasks).toHaveLength(1);
  });
});

// --- 10-12: personal tasks -----------------------------------------------------
describe('addPersonalStudyPlanTask', () => {
  it('adds a personal task with a stable unique id, date and minutes', () => {
    const result = addPersonalStudyPlanTask([], { title: 'Revise my notes', date: '2026-01-06', estimatedMinutes: 20 });
    expect(result.ok).toBe(true);
    const [added] = result.tasks;
    expect(added.title).toBe('Revise my notes');
    expect(added.date).toBe('2026-01-06');
    expect(added.estimatedMinutes).toBe(20);
    expect(added.taskType).toBe('personal');
    expect(added.status).toBe('pending');
    expect(typeof added.id).toBe('string');
    expect(added.id.length).toBeGreaterThan(0);
  });

  it('never attaches a fake syllabus topic id — the type has no topicId/subjectId at all', () => {
    const result = addPersonalStudyPlanTask([], { title: 'Read current affairs', date: '2026-01-06', estimatedMinutes: 15 });
    const added = result.tasks[0] as PersonalPlanTask & { topicId?: unknown; subjectId?: unknown };
    expect('topicId' in added).toBe(false);
    expect('subjectId' in added).toBe(false);
  });

  it('rejects an empty title, invalid date, or non-positive/oversized minutes', () => {
    expect(addPersonalStudyPlanTask([], { title: '  ', date: '2026-01-06', estimatedMinutes: 10 }).ok).toBe(false);
    expect(addPersonalStudyPlanTask([], { title: 'X', date: 'not-a-date', estimatedMinutes: 10 }).ok).toBe(false);
    expect(addPersonalStudyPlanTask([], { title: 'X', date: '2026-01-06', estimatedMinutes: 0 }).ok).toBe(false);
    expect(addPersonalStudyPlanTask([], { title: 'X', date: '2026-01-06', estimatedMinutes: MAX_TASK_MINUTES + 1 }).ok).toBe(false);
  });

  it('personal tasks never affect syllabus coverage — computeUnifiedTopicStatus never even receives them', () => {
    // Coverage is computed purely from completedTopics + PYQ performance; the task list (personal
    // or otherwise) is never one of its inputs, so adding personal tasks cannot change it.
    const completedTopics = { [SYLLABUS[0].topics[0].id]: true };
    const before = computeUnifiedTopicStatus(SYLLABUS, completedTopics, null);
    addPersonalStudyPlanTask([], { title: 'Revise my notes', date: '2026-01-06', estimatedMinutes: 20 });
    const after = computeUnifiedTopicStatus(SYLLABUS, completedTopics, null);
    expect(after).toEqual(before);
  });
});

// --- 13-17, 20: rebalance -------------------------------------------------------
describe('rebalanceStudyPlan', () => {
  it('respects configured study days: every rebalanced task lands on one of them', () => {
    const tasks = [
      task({ id: 'a', date: '2026-01-05', priority: 1 }),
      task({ id: 'b', date: '2026-01-05', priority: 2, topicId: 't-2', estimatedMinutes: 50 }),
    ];
    const result = rebalanceStudyPlan(capacity, tasks);
    for (const t of result.tasks) {
      expect(capacity.studyDayDates).toContain(t.date);
    }
  });

  it('respects the target date: never schedules past the last available study day', () => {
    const many = Array.from({ length: 10 }, (_, i) => task({ id: `t${i}`, topicId: `topic-${i}`, date: '2026-01-05', priority: i, estimatedMinutes: 50 }));
    const result = rebalanceStudyPlan(capacity, many);
    const lastDate = capacity.studyDayDates[capacity.studyDayDates.length - 1];
    for (const t of result.tasks) {
      expect(t.date <= lastDate).toBe(true);
    }
    // Not everything can fit (10 x 50min > 360min available) -> honestly reported, not dropped.
    expect(result.unscheduledTaskIds.length).toBeGreaterThan(0);
  });

  it('does not change completed tasks at all', () => {
    const completed = task({ id: 'done', status: 'completed', date: '2026-01-05', estimatedMinutes: 50, title: 'Study: Done Topic', reason: 'x' });
    const pending = task({ id: 'pending', date: '2026-01-05', topicId: 't-2', priority: 1, estimatedMinutes: 50 });
    const result = rebalanceStudyPlan(capacity, [completed, pending]);
    expect(result.tasks.find((t) => t.id === 'done')).toEqual(completed);
  });

  it('avoids duplicate tasks: the id set is identical before and after (minus any genuinely unscheduled)', () => {
    const tasks = [task({ id: 'a', date: '2026-01-05' }), task({ id: 'b', date: '2026-01-06', topicId: 't-2' })];
    const result = rebalanceStudyPlan(capacity, tasks);
    const resultIds = result.tasks.map((t) => t.id).sort();
    expect(resultIds).toEqual(['a', 'b']);
  });

  it('minimizes unnecessary movement: a task that already fits keeps its date (movedCount reflects only real moves)', () => {
    const tasks = [task({ id: 'a', date: '2026-01-05', priority: 1 }), task({ id: 'b', date: '2026-01-06', priority: 2, topicId: 't-2' })];
    const result = rebalanceStudyPlan(capacity, tasks);
    expect(result.movedCount).toBe(0);
    expect(result.tasks.find((t) => t.id === 'a')?.date).toBe('2026-01-05');
    expect(result.tasks.find((t) => t.id === 'b')?.date).toBe('2026-01-06');
  });

  it('moves a task forward (never earlier) when its day is over capacity', () => {
    // Two 50-min tasks both dated 2026-01-05 (60 min/day cap) -> the lower-priority one must move.
    const tasks = [task({ id: 'a', date: '2026-01-05', priority: 1, estimatedMinutes: 50 }), task({ id: 'b', date: '2026-01-05', priority: 2, topicId: 't-2', estimatedMinutes: 50 })];
    const result = rebalanceStudyPlan(capacity, tasks);
    expect(result.tasks.find((t) => t.id === 'a')?.date).toBe('2026-01-05'); // higher priority keeps its slot
    const moved = result.tasks.find((t) => t.id === 'b')!;
    expect(moved.date >= '2026-01-05').toBe(true);
    expect(moved.date).not.toBe('2026-01-05');
    expect(result.movedCount).toBe(1);
  });

  it('is deterministic: the same input always produces the same output', () => {
    const tasks = [
      task({ id: 'a', date: '2026-01-05', priority: 1, estimatedMinutes: 50 }),
      task({ id: 'b', date: '2026-01-05', priority: 2, topicId: 't-2', estimatedMinutes: 50 }),
      task({ id: 'c', date: '2026-01-06', priority: 3, topicId: 't-3', status: 'completed', estimatedMinutes: 50 }),
    ];
    const first = rebalanceStudyPlan(capacity, tasks);
    const second = rebalanceStudyPlan(capacity, tasks);
    expect(first).toEqual(second);
  });

  it('never raises the per-day cap: no day ever exceeds minutesPerStudyDay after rebalancing', () => {
    const many = Array.from({ length: 8 }, (_, i) => task({ id: `t${i}`, topicId: `topic-${i}`, date: '2026-01-05', priority: i, estimatedMinutes: 40 }));
    const result = rebalanceStudyPlan(capacity, many);
    const byDate = new Map<string, number>();
    for (const t of result.tasks) byDate.set(t.date, (byDate.get(t.date) ?? 0) + t.estimatedMinutes);
    for (const minutes of byDate.values()) {
      expect(minutes).toBeLessThanOrEqual(capacity.minutesPerStudyDay);
    }
  });

  it('rebalances real engine output (SYLLABUS-derived tasks) without throwing', () => {
    const config: StudyPlanConfig = { startDate: '2026-01-01', targetDate: '2026-12-20', studyDaysPerWeek: 6, hoursPerStudyDay: 3 };
    const result = generateStudyPlan({ config, syllabus: SYLLABUS, completedTopics: {}, pyqPerf: null });
    if (!result.ok) throw new Error('expected ok plan');
    const rebalanced = rebalanceStudyPlan(result.plan.capacity, result.plan.tasks);
    expect(rebalanced.tasks.length).toBe(result.plan.tasks.length);
  });
});

// --- 18-19: capacity after editing -----------------------------------------------
describe('computeEditedCapacity', () => {
  it('detects over-capacity when planned minutes exceed total available minutes', () => {
    const tasks = Array.from({ length: 10 }, (_, i) => task({ id: `t${i}`, estimatedMinutes: 50 }));
    const report = computeEditedCapacity(capacity, tasks); // 500 min planned vs 360 available
    expect(report.verdict).toBe('insufficient');
    expect(report.overCapacityMinutes).toBeGreaterThan(0);
    expect(report.message.length).toBeGreaterThan(0);
  });

  it('reports comfortable when well within capacity', () => {
    const report = computeEditedCapacity(capacity, [task({ id: 'a', estimatedMinutes: 50 })]);
    expect(report.verdict).toBe('comfortable');
    expect(report.overCapacityMinutes).toBe(0);
  });

  it('separates completed minutes from planned pending minutes honestly', () => {
    const tasks = [task({ id: 'a', status: 'completed', estimatedMinutes: 50 }), task({ id: 'b', estimatedMinutes: 30, topicId: 't-2' })];
    const report = computeEditedCapacity(capacity, tasks);
    expect(report.completedMinutes).toBe(50);
    expect(report.plannedPendingMinutes).toBe(30);
    expect(report.totalPlannedMinutes).toBe(80);
  });

  it('never produces NaN, Infinity, or negative values', () => {
    for (const tasks of [[], [task({ id: 'a', estimatedMinutes: 1 })]]) {
      const report = computeEditedCapacity(capacity, tasks);
      for (const n of [report.totalAvailableMinutes, report.plannedPendingMinutes, report.completedMinutes, report.totalPlannedMinutes, report.overCapacityMinutes]) {
        expect(Number.isFinite(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// --- P1 fix #2: Regenerate-confirmation decision logic ------------------------------
describe('planHasCompletedTasks', () => {
  it('is false for an empty task list', () => {
    expect(planHasCompletedTasks([])).toBe(false);
  });

  it('is false when every task is still pending', () => {
    const tasks = [task({ id: 't1' }), task({ id: 't2', status: 'pending' })];
    expect(planHasCompletedTasks(tasks)).toBe(false);
  });

  it('is true when at least one task is completed', () => {
    const tasks = [task({ id: 't1' }), task({ id: 't2', status: 'completed' })];
    expect(planHasCompletedTasks(tasks)).toBe(true);
  });

  it('is true when every task is completed', () => {
    const tasks = [task({ id: 't1', status: 'completed' }), task({ id: 't2', status: 'completed' })];
    expect(planHasCompletedTasks(tasks)).toBe(true);
  });
});
