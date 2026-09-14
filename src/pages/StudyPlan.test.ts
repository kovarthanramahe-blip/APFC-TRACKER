import { describe, it, expect, beforeEach } from 'vitest';
import { groupTasksByDate, groupTasksByPhase } from './StudyPlan';
import { useAppStore, exportAllData, importAllData } from '../lib/store';
import { generateStudyPlan, validateStudyPlanConfig, type StudyPlanConfig, type StudyPlanTask } from '../lib/studyPlan';
import {
  completeStudyPlanTask,
  moveStudyPlanTask,
  rebalanceStudyPlan,
  addPersonalStudyPlanTask,
  computeEditedCapacity,
} from '../lib/studyPlanEditing';
import { computePyqPerformance } from '../lib/pyqPerformance';
import { SYLLABUS, getAllTopicsCount } from '../data/syllabus';
import { PYQ_BANK } from '../data/pyq';

// This page has no rendering test here (the project has no React Testing Library / DOM test
// environment — see the other *.test.ts files in this repo, which all test exported pure
// functions directly rather than rendering components). Instead these tests exercise exactly
// what the page itself does: the pure grouping helpers it exports, the real Zustand store it
// reads/writes (a plain JS object, safely testable without rendering), and the same
// generateStudyPlan() call path the "Generate Study Plan" button triggers. Actual on-screen
// rendering and the 390px layout were verified with a manual browser smoke check (see the task
// report) rather than here.

function task(overrides: Partial<StudyPlanTask>): StudyPlanTask {
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

function validConfig(overrides: Partial<StudyPlanConfig> = {}): StudyPlanConfig {
  return {
    startDate: '2026-01-01',
    targetDate: '2026-12-20',
    studyDaysPerWeek: 6,
    hoursPerStudyDay: 3,
    ...overrides,
  };
}

// --- 9: date/phase grouping (extracted from the page for direct testing) ----
describe('groupTasksByDate', () => {
  it('groups tasks under their date, dates sorted ascending', () => {
    const tasks = [task({ id: 'a', date: '2026-02-01' }), task({ id: 'b', date: '2026-01-05' }), task({ id: 'c', date: '2026-01-05' })];
    const grouped = groupTasksByDate(tasks);
    expect(grouped.map(([date]) => date)).toEqual(['2026-01-05', '2026-02-01']);
    expect(grouped.find(([date]) => date === '2026-01-05')?.[1]).toHaveLength(2);
  });

  it('returns an empty list for no tasks', () => {
    expect(groupTasksByDate([])).toEqual([]);
  });
});

describe('groupTasksByPhase', () => {
  it('groups a date\'s tasks by phase', () => {
    const tasks = [task({ id: 'a', phase: 'coverage' }), task({ id: 'b', phase: 'revision' }), task({ id: 'c', phase: 'coverage' })];
    const grouped = groupTasksByPhase(tasks);
    const phases = grouped.map(([phase]) => phase);
    expect(phases).toContain('coverage');
    expect(phases).toContain('revision');
    expect(grouped.find(([phase]) => phase === 'coverage')?.[1]).toHaveLength(2);
  });
});

// --- 2-3: config validation (what the page shows inline) ---------------------
describe('page configuration validation', () => {
  it('a default-shaped configuration (today, real target date, positive hours) is valid', () => {
    const config = validConfig({ startDate: '2026-01-01', targetDate: '2026-12-20', studyDaysPerWeek: 6, hoursPerStudyDay: 1 });
    expect(validateStudyPlanConfig(config)).toEqual([]);
  });

  it('an invalid configuration (studyDaysPerWeek out of range) surfaces a field-level error', () => {
    const errors = validateStudyPlanConfig(validConfig({ studyDaysPerWeek: 8 }));
    expect(errors.some((e) => e.field === 'studyDaysPerWeek')).toBe(true);
  });
});

// --- store integration (what setStudyPlan / persistence actually do) --------
describe('study plan store integration', () => {
  beforeEach(() => {
    useAppStore.setState({ studyPlan: null, studyPlanGeneratedAt: null, completedTopics: {}, pyqAttempts: [] });
  });

  it('starts with no plan — the condition the page\'s empty state renders on', () => {
    expect(useAppStore.getState().studyPlan).toBeNull();
  });

  it('generate action: calling generateStudyPlan with the store\'s current data and storing the result works end-to-end', () => {
    useAppStore.setState({ completedTopics: { [SYLLABUS[0].topics[0].id]: true } });
    const { completedTopics, pyqAttempts } = useAppStore.getState();
    const pyqPerf = computePyqPerformance(PYQ_BANK, pyqAttempts);
    const result = generateStudyPlan({ config: validConfig(), syllabus: SYLLABUS, completedTopics, pyqPerf });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    useAppStore.getState().setStudyPlan(result.plan);
    expect(useAppStore.getState().studyPlan).toEqual(result.plan);
    expect(useAppStore.getState().studyPlanGeneratedAt).not.toBeNull();
  });

  it('existing progress is actually passed into generation: a topic marked covered does not get a coverage task', () => {
    const topicId = SYLLABUS[0].topics[0].id;
    useAppStore.setState({ completedTopics: { [topicId]: true } });
    const { completedTopics, pyqAttempts } = useAppStore.getState();
    const result = generateStudyPlan({ config: validConfig(), syllabus: SYLLABUS, completedTopics, pyqPerf: computePyqPerformance(PYQ_BANK, pyqAttempts) });
    if (!result.ok) throw new Error('expected ok plan');
    const taskForTopic = result.plan.tasks.find((t) => t.topicId === topicId);
    // Covered with no PYQ attempts -> needs_practice, never a coverage task.
    expect(taskForTopic?.taskType).not.toBe('coverage');
  });

  it('capacity summary: a comfortable configuration reports the comfortable verdict', () => {
    const result = generateStudyPlan({
      config: validConfig({ startDate: '2026-01-01', targetDate: '2026-12-20', studyDaysPerWeek: 6, hoursPerStudyDay: 4 }),
      syllabus: SYLLABUS,
      completedTopics: {},
      pyqPerf: null,
    });
    if (!result.ok) throw new Error('expected ok plan');
    expect(result.plan.capacityReport.verdict).toBe('comfortable');
  });

  it('capacity summary: a scarce configuration reports the insufficient verdict with a non-empty warning message', () => {
    const result = generateStudyPlan({
      config: validConfig({ startDate: '2026-01-01', targetDate: '2026-01-02', studyDaysPerWeek: 7, hoursPerStudyDay: 10 / 60 }),
      syllabus: SYLLABUS,
      completedTopics: {},
      pyqPerf: null,
    });
    if (!result.ok) throw new Error('expected ok plan');
    expect(result.plan.capacityReport.verdict).toBe('insufficient');
    expect(result.plan.capacityReport.message.length).toBeGreaterThan(0);
    expect(result.plan.unscheduledTopicIds.length).toBeGreaterThan(0);
  });

  it('generated tasks and phase information are present for a real, ample-capacity plan', () => {
    const result = generateStudyPlan({
      config: validConfig({ startDate: '2026-01-01', targetDate: '2026-12-20', studyDaysPerWeek: 6, hoursPerStudyDay: 3 }),
      syllabus: SYLLABUS,
      completedTopics: {},
      pyqPerf: null,
    });
    if (!result.ok) throw new Error('expected ok plan');
    expect(result.plan.tasks.length).toBeGreaterThan(0);
    expect(result.plan.coverageSummary.totalTopics).toBe(getAllTopicsCount());
    expect(result.plan.phases.length).toBeGreaterThan(0);
    for (const phase of result.plan.phases) {
      expect(phase.startDate <= phase.endDate).toBe(true);
    }
  });

  it('plan persists through the store: setStudyPlan is readable back immediately, and clearStudyPlan resets it', () => {
    const result = generateStudyPlan({ config: validConfig(), syllabus: SYLLABUS, completedTopics: {}, pyqPerf: null });
    if (!result.ok) throw new Error('expected ok plan');
    useAppStore.getState().setStudyPlan(result.plan);
    expect(useAppStore.getState().studyPlan?.tasks.length).toBe(result.plan.tasks.length);
    useAppStore.getState().clearStudyPlan();
    expect(useAppStore.getState().studyPlan).toBeNull();
    expect(useAppStore.getState().studyPlanGeneratedAt).toBeNull();
  });

  it('setStudyPlan writes through the store\'s single persist() call without throwing or dropping data (what makes it survive a real page refresh)', () => {
    // There's no jsdom/localStorage in this test environment (see the other *.test.ts files in
    // this repo — none exercise real browser storage), so this is the closest honest check
    // available here: studyPlan/studyPlanGeneratedAt are ordinary fields on the SAME
    // `persist(..., { name: 'apfc-tracker-storage' })`-wrapped store (src/lib/store.ts) that
    // examDate, dailyGoalMinutes etc. already rely on to survive a refresh — no separate
    // localStorage system was created for this feature, and adding these two fields doesn't
    // break the store's own persist() call.
    const result = generateStudyPlan({ config: validConfig(), syllabus: SYLLABUS, completedTopics: {}, pyqPerf: null });
    if (!result.ok) throw new Error('expected ok plan');
    useAppStore.getState().setStudyPlan(result.plan);
    expect(useAppStore.getState().studyPlan?.tasks.length).toBe(result.plan.tasks.length);
  });

  it('regenerate replaces the previous plan rather than creating duplicates', () => {
    const first = generateStudyPlan({ config: validConfig({ hoursPerStudyDay: 1 }), syllabus: SYLLABUS, completedTopics: {}, pyqPerf: null });
    const second = generateStudyPlan({ config: validConfig({ hoursPerStudyDay: 5 }), syllabus: SYLLABUS, completedTopics: {}, pyqPerf: null });
    if (!first.ok || !second.ok) throw new Error('expected ok plans');
    useAppStore.getState().setStudyPlan(first.plan);
    const firstGeneratedAt = useAppStore.getState().studyPlanGeneratedAt;
    useAppStore.getState().setStudyPlan(second.plan);
    // Only ever a single `studyPlan` field — no array/history, so this IS the replacement check.
    expect(useAppStore.getState().studyPlan?.config.hoursPerStudyDay).toBe(5);
    expect(useAppStore.getState().studyPlan).not.toEqual(first.plan);
    expect(typeof firstGeneratedAt).toBe('string');
  });

  it('resetAllData clears the study plan along with everything else', () => {
    const result = generateStudyPlan({ config: validConfig(), syllabus: SYLLABUS, completedTopics: {}, pyqPerf: null });
    if (!result.ok) throw new Error('expected ok plan');
    useAppStore.getState().setStudyPlan(result.plan);
    useAppStore.getState().resetAllData();
    expect(useAppStore.getState().studyPlan).toBeNull();
    expect(useAppStore.getState().studyPlanGeneratedAt).toBeNull();
  });

  it('exportAllData / importAllData round-trip the study plan', () => {
    const result = generateStudyPlan({ config: validConfig(), syllabus: SYLLABUS, completedTopics: {}, pyqPerf: null });
    if (!result.ok) throw new Error('expected ok plan');
    useAppStore.getState().setStudyPlan(result.plan);
    const json = exportAllData();
    useAppStore.getState().clearStudyPlan();
    expect(useAppStore.getState().studyPlan).toBeNull();
    importAllData(json);
    expect(useAppStore.getState().studyPlan?.tasks.length).toBe(result.plan.tasks.length);
  });
});

// --- Stage 3: editing/rebalancing integration --------------------------------
describe('study plan editing — store integration', () => {
  beforeEach(() => {
    useAppStore.setState({ studyPlan: null, studyPlanGeneratedAt: null, completedTopics: {}, pyqAttempts: [], personalStudyPlanTasks: [] });
  });

  function generate() {
    const result = generateStudyPlan({
      config: validConfig({ startDate: '2026-01-01', targetDate: '2026-12-20', studyDaysPerWeek: 6, hoursPerStudyDay: 3 }),
      syllabus: SYLLABUS,
      completedTopics: {},
      pyqPerf: null,
    });
    if (!result.ok) throw new Error('expected ok plan');
    useAppStore.getState().setStudyPlan(result.plan);
    return result.plan;
  }

  it('setStudyPlanTasks (what completing/moving/resizing a task calls) updates plan.tasks while preserving every other plan field', () => {
    const plan = generate();
    const targetTask = plan.tasks[0];
    const result = completeStudyPlanTask(plan.tasks, targetTask.id);
    expect(result.ok).toBe(true);
    useAppStore.getState().setStudyPlanTasks(result.tasks);

    const updated = useAppStore.getState().studyPlan!;
    expect(updated.tasks.find((t) => t.id === targetTask.id)?.status).toBe('completed');
    expect(updated.capacity).toEqual(plan.capacity);
    expect(updated.coverageSummary).toEqual(plan.coverageSummary);
    expect(updated.config).toEqual(plan.config);
  });

  it('a moved task persists its new date through the store', () => {
    const plan = generate();
    const targetTask = plan.tasks.find((t) => t.status === 'pending')!;
    const otherDate = plan.capacity.studyDayDates.find((d) => d !== targetTask.date)!;
    const result = moveStudyPlanTask(plan.tasks, targetTask.id, otherDate, { validStudyDates: plan.capacity.studyDayDates });
    expect(result.ok).toBe(true);
    useAppStore.getState().setStudyPlanTasks(result.tasks);
    expect(useAppStore.getState().studyPlan!.tasks.find((t) => t.id === targetTask.id)?.date).toBe(otherDate);
  });

  it('personal tasks persist in their own store field, independent of the generated plan', () => {
    generate();
    const result = addPersonalStudyPlanTask([], { title: 'Revise my notes', date: '2026-01-06', estimatedMinutes: 20 });
    expect(result.ok).toBe(true);
    useAppStore.getState().setPersonalStudyPlanTasks(result.tasks);
    expect(useAppStore.getState().personalStudyPlanTasks).toHaveLength(1);
    expect(useAppStore.getState().personalStudyPlanTasks[0].title).toBe('Revise my notes');
    // The generated plan's own task list is completely unaffected — and StudyPlanTask's
    // taskType union structurally has no 'personal' member at all, so this isn't just a runtime
    // check, TypeScript itself guarantees a personal task can never end up in plan.tasks.
    const personalId = useAppStore.getState().personalStudyPlanTasks[0].id;
    expect(useAppStore.getState().studyPlan!.tasks.some((t) => t.id === personalId)).toBe(false);
  });

  it('rebalance (what "Rebalance Remaining Plan" calls) replaces plan.tasks via the same setter, leaving completed tasks untouched', () => {
    const plan = generate();
    const firstPending = plan.tasks.find((t) => t.status === 'pending')!;
    const completeResult = completeStudyPlanTask(plan.tasks, firstPending.id);
    useAppStore.getState().setStudyPlanTasks(completeResult.tasks);

    const beforeRebalance = useAppStore.getState().studyPlan!;
    const rebalanceResult = rebalanceStudyPlan(beforeRebalance.capacity, beforeRebalance.tasks);
    useAppStore.getState().setStudyPlanTasks(rebalanceResult.tasks);

    const afterRebalance = useAppStore.getState().studyPlan!;
    expect(afterRebalance.tasks.find((t) => t.id === firstPending.id)).toEqual(completeResult.tasks.find((t) => t.id === firstPending.id));
  });

  it('regenerating (Generate/Regenerate button) replaces the whole plan — including any edits — rather than merging', () => {
    const plan = generate();
    const completed = completeStudyPlanTask(plan.tasks, plan.tasks[0].id);
    useAppStore.getState().setStudyPlanTasks(completed.tasks);
    expect(useAppStore.getState().studyPlan!.tasks.some((t) => t.status === 'completed')).toBe(true);

    const regenerated = generateStudyPlan({
      config: validConfig({ startDate: '2026-01-01', targetDate: '2026-12-20', studyDaysPerWeek: 6, hoursPerStudyDay: 3 }),
      syllabus: SYLLABUS,
      completedTopics: {},
      pyqPerf: null,
    });
    if (!regenerated.ok) throw new Error('expected ok plan');
    useAppStore.getState().setStudyPlan(regenerated.plan);
    // A fresh generation always produces all-pending tasks — the prior edit is gone, as expected
    // for "Regenerate replaces the previous plan", not merged with it.
    expect(useAppStore.getState().studyPlan!.tasks.every((t) => t.status === 'pending')).toBe(true);
  });

  it('resetAllData also clears personalStudyPlanTasks', () => {
    useAppStore.getState().setPersonalStudyPlanTasks([{ id: 'p1', date: '2026-01-06', title: 'X', estimatedMinutes: 10, status: 'pending', taskType: 'personal', reason: 'Added by you.' }]);
    useAppStore.getState().resetAllData();
    expect(useAppStore.getState().personalStudyPlanTasks).toEqual([]);
  });

  it('exportAllData / importAllData round-trip personal tasks too', () => {
    useAppStore.getState().setPersonalStudyPlanTasks([{ id: 'p1', date: '2026-01-06', title: 'Read current affairs', estimatedMinutes: 15, status: 'pending', taskType: 'personal', reason: 'Added by you.' }]);
    const json = exportAllData();
    useAppStore.getState().setPersonalStudyPlanTasks([]);
    importAllData(json);
    expect(useAppStore.getState().personalStudyPlanTasks).toHaveLength(1);
    expect(useAppStore.getState().personalStudyPlanTasks[0].title).toBe('Read current affairs');
  });

  it('the live edited-capacity report reflects completed + pending + personal tasks together', () => {
    const plan = generate();
    const addResult = addPersonalStudyPlanTask([], { title: 'Revise my notes', date: '2026-01-06', estimatedMinutes: 20 });
    useAppStore.getState().setPersonalStudyPlanTasks(addResult.tasks);

    const report = computeEditedCapacity(plan.capacity, [...plan.tasks, ...useAppStore.getState().personalStudyPlanTasks]);
    const expectedPending = plan.tasks.filter((t) => t.status === 'pending').reduce((sum, t) => sum + t.estimatedMinutes, 0) + 20;
    expect(report.plannedPendingMinutes).toBe(expectedPending);
  });
});
