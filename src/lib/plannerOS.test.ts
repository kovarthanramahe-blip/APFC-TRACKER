import { describe, it, expect } from 'vitest';
import { bucketUpcomingPlannerTasks, computePlannerOverview } from './plannerOS';
import type { StudyPlanTask } from './studyPlan';
import type { PersonalPlanTask } from './studyPlanEditing';
import type { DailyQueueResult } from './studyPlanDailyQueue';

const TODAY = '2026-09-22';

function syllabusTask(overrides: Partial<StudyPlanTask> & { id: string; date: string }): StudyPlanTask {
  return {
    topicId: 't1',
    subjectId: 's1',
    phase: 'coverage',
    taskType: 'coverage',
    title: 'Task',
    estimatedMinutes: 30,
    priority: 1,
    status: 'pending',
    reason: 'Not yet covered.',
    ...overrides,
  };
}

function personalTask(overrides: Partial<PersonalPlanTask> & { id: string; date: string }): PersonalPlanTask {
  return { title: 'Personal', estimatedMinutes: 20, status: 'pending', taskType: 'personal', reason: 'Added by you.', ...overrides };
}

describe('bucketUpcomingPlannerTasks', () => {
  it('excludes today and the past entirely — this bucketer only covers STRICTLY after today', () => {
    const tasks = [syllabusTask({ id: 'a', date: TODAY }), syllabusTask({ id: 'b', date: '2026-09-20' })];
    const buckets = bucketUpcomingPlannerTasks(tasks, [], TODAY);
    expect(buckets.tomorrow).toEqual([]);
    expect(buckets.thisWeek).toEqual([]);
    expect(buckets.later).toEqual([]);
  });

  it('buckets tomorrow/thisWeek/later correctly across the 7-day boundary', () => {
    const tasks = [
      syllabusTask({ id: 'a', date: '2026-09-23' }), // tomorrow
      syllabusTask({ id: 'b', date: '2026-09-26' }), // this week (day 4)
      syllabusTask({ id: 'c', date: '2026-09-29' }), // this week (day 7, boundary)
      syllabusTask({ id: 'd', date: '2026-09-30' }), // later (day 8)
    ];
    const buckets = bucketUpcomingPlannerTasks(tasks, [], TODAY);
    expect(buckets.tomorrow.map((t) => t.id)).toEqual(['a']);
    expect(buckets.thisWeek.map((t) => t.id)).toEqual(['b', 'c']);
    expect(buckets.later.map((t) => t.id)).toEqual(['d']);
  });

  it('never includes a completed or skipped task', () => {
    const tasks = [syllabusTask({ id: 'a', date: '2026-09-23', status: 'completed' }), syllabusTask({ id: 'b', date: '2026-09-23', status: 'skipped' })];
    const buckets = bucketUpcomingPlannerTasks(tasks, [], TODAY);
    expect(buckets.tomorrow).toEqual([]);
  });

  it('merges syllabus and personal tasks, tagging each with its real kind and only carrying topicId for syllabus tasks', () => {
    const planTasks = [syllabusTask({ id: 'a', date: '2026-09-23', topicId: 'topic-x' })];
    const personalTasks = [personalTask({ id: 'p1', date: '2026-09-23' })];
    const buckets = bucketUpcomingPlannerTasks(planTasks, personalTasks, TODAY);
    expect(buckets.tomorrow).toHaveLength(2);
    const syllabusRef = buckets.tomorrow.find((t) => t.kind === 'syllabus');
    const personalRef = buckets.tomorrow.find((t) => t.kind === 'personal');
    expect(syllabusRef?.topicId).toBe('topic-x');
    expect(personalRef?.topicId).toBeUndefined();
  });

  it('returns all-empty buckets for no tasks at all', () => {
    const buckets = bucketUpcomingPlannerTasks([], [], TODAY);
    expect(buckets).toEqual({ tomorrow: [], thisWeek: [], later: [] });
  });
});

describe('computePlannerOverview', () => {
  it('zeroes every active-plan-derived field when there is no plan, but still buckets upcoming personal tasks', () => {
    const noPlan: DailyQueueResult = { status: 'no_plan', currentDate: TODAY };
    const personalTasks = [personalTask({ id: 'p1', date: '2026-09-23' })];
    const overview = computePlannerOverview(noPlan, [], personalTasks, TODAY);
    expect(overview.hasActivePlan).toBe(false);
    expect(overview).toMatchObject({ todayRemainingCount: 0, todayCompletedCount: 0, overdueCount: 0, priorityItems: [] });
    expect(overview.tomorrowCount).toBe(1);
  });

  it('reads today/overdue/priorityItems straight from an active daily queue, never recomputing them', () => {
    const activeQueue: DailyQueueResult = {
      status: 'active',
      currentDate: TODAY,
      todayState: 'pending',
      isStudyDay: true,
      capacity: { configuredMinutes: 60, plannedMinutes: 30, completedMinutes: 0, remainingMinutes: 30, utilizationPct: 50, overCapacity: false },
      todayPending: [
        { id: 'study_plan:a', source: 'study_plan', task: syllabusTask({ id: 'a', date: TODAY }), priority: 2, reason: 'Needs syllabus coverage', overdue: false, estimatedMinutes: 30 },
      ],
      todayCompletedCount: 2,
      overdueTasks: [
        { id: 'study_plan:b', source: 'study_plan', task: syllabusTask({ id: 'b', date: '2026-09-20' }), priority: -1 + 2, reason: 'Overdue', overdue: true, estimatedMinutes: 30 },
      ],
      nextUp: [],
      recommendedOrder: [
        { id: 'study_plan:b', source: 'study_plan', task: syllabusTask({ id: 'b', date: '2026-09-20' }), priority: 1, reason: 'Overdue', overdue: true, estimatedMinutes: 30 },
        { id: 'study_plan:a', source: 'study_plan', task: syllabusTask({ id: 'a', date: TODAY }), priority: 2, reason: 'Needs syllabus coverage', overdue: false, estimatedMinutes: 30 },
      ],
    };
    const overview = computePlannerOverview(activeQueue, [], [], TODAY, 1);
    expect(overview.hasActivePlan).toBe(true);
    expect(overview.todayRemainingCount).toBe(1);
    expect(overview.todayCompletedCount).toBe(2);
    expect(overview.overdueCount).toBe(1);
    // maxPriorityItems=1 — sliced, not recomputed, and overdue-first ordering is preserved verbatim.
    expect(overview.priorityItems).toHaveLength(1);
    expect(overview.priorityItems[0].id).toBe('study_plan:b');
  });
});
