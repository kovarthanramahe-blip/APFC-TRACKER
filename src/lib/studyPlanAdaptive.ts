// Stage 4 of the Study Plan feature — adapting an already-generated plan to the student's CURRENT
// real progress. Stage 1 (lib/studyPlan.ts) remains the only place full plan generation happens;
// Stage 3 (lib/studyPlanEditing.ts) remains the only place task-level edits/rebalancing happen.
// This module only computes a DELTA on top of both: which already-scheduled topics no longer need
// the workload they were given, which need different or additional workload now, and then reuses
// Stage 3's own rebalanceStudyPlan (never a re-implementation of it) to repack what remains.
//
// Core principle: PAST/COMPLETED WORK = FIXED, REMAINING WORK = ADAPTIVE. A completed task's date,
// duration, and status are never touched here, under any circumstance. This module only ever
// reconsiders topics the plan has ALREADY scheduled at least one task for (pending or completed) —
// it does not re-run Stage 1's topic discovery/prioritization/budgeting to find brand-new topics
// to schedule; that is what "Regenerate Plan" is for. Pure and deterministic: identical inputs
// (including the caller-supplied `currentDate` — this module never calls `new Date()` itself)
// always produce identical output.
import type { PlanCapacity, PlanPhaseId, PlanTaskType, StudyPlan, StudyPlanTask } from './studyPlan';
import { BUFFER_RATIO, estimateTopicWorkload } from './studyPlan';
import { rebalanceStudyPlan } from './studyPlanEditing';
import type { PersonalPlanTask } from './studyPlanEditing';
import { computeUnifiedTopicStatus, type UnifiedTopicStatus } from './topicStatus';
import type { SyllabusSubject } from './types';
import type { PyqPerformanceSnapshot } from './pyqPerformance';

export interface AdaptiveInput {
  plan: StudyPlan;
  personalTasks: PersonalPlanTask[];
  syllabus: SyllabusSubject[];
  completedTopics: Record<string, boolean>;
  pyqPerf: PyqPerformanceSnapshot | null;
  /** yyyy-mm-dd — the caller's "today". Never inferred internally, so this module stays pure. */
  currentDate: string;
}

export type AdaptiveChangeKind = 'added' | 'removed' | 'moved';

export interface AdaptiveChange {
  taskId: string;
  topicId: string;
  kind: AdaptiveChangeKind;
  reason: string;
}

export type RemainingCapacityVerdict = 'on_track' | 'tight' | 'over_capacity' | 'completed';

export interface RemainingCapacityReport {
  remainingStudyDays: number;
  remainingAvailableMinutes: number;
  remainingPlannedMinutes: number;
  remainingDeficitMinutes: number;
  remainingSurplusMinutes: number;
  /** 0-100+, rounded to 1 decimal. Only 0 or 100 when remainingAvailableMinutes is 0 (see below). */
  utilizationPct: number;
  verdict: RemainingCapacityVerdict;
  message: string;
}

export interface AdaptiveResult {
  /** The plan's full task list after adaptation: completed tasks untouched, pending tasks
   * adapted (some removed, some added, remainder rebalanced) — ready to persist as-is. */
  updatedTasks: StudyPlanTask[];
  removedTaskIds: string[];
  addedTaskIds: string[];
  movedTaskIds: string[];
  unchangedTaskIds: string[];
  completedTaskIds: string[];
  /** Pending tasks whose date was already before `currentDate` when this run started. */
  missedTaskIds: string[];
  unscheduledTaskIds: string[];
  /** P1 fix #1 — topics whose current workload needs a task but has none in `updatedTasks` (see
   * computeUnscheduledTopicIds below). Freshly recomputed here every run, so this never goes
   * stale after adapting — callers should persist this alongside `updatedTasks`. */
  unscheduledTopicIds: string[];
  warnings: string[];
  capacityReport: RemainingCapacityReport;
  /** One entry per meaningful change, each with a concrete, deterministic reason — never a vague
   * generated explanation — so the UI can answer "why did my plan change?". */
  changes: AdaptiveChange[];
}

/**
 * P1 fix #1 — "which topics currently need a task but don't have one?", derived live from CURRENT
 * tasks + CURRENT topic status, rather than trusting a frozen snapshot from whenever the plan was
 * last generated. This is exactly the same per-topic check adaptStudyPlan already makes internally
 * to decide whether to add a task (a topic "has" what it needs when some task — pending or
 * completed — already matches its current required taskType); exposed here so both Rebalance and
 * Adapt can refresh `StudyPlan.unscheduledTopicIds` instead of leaving it stale. Never recomputes
 * the Stage 1 generation/budgeting algorithm itself.
 */
export function computeUnscheduledTopicIds(
  tasks: StudyPlanTask[],
  syllabus: SyllabusSubject[],
  completedTopics: Record<string, boolean>,
  pyqPerf: PyqPerformanceSnapshot | null,
): string[] {
  const statuses = computeUnifiedTopicStatus(syllabus, completedTopics, pyqPerf);
  const unscheduled: string[] = [];
  for (const status of statuses) {
    const workload = estimateTopicWorkload(status);
    if (!workload.taskType) continue; // 'strong' — nothing needed
    const hasMatchingTask = tasks.some((t) => t.topicId === status.topicId && t.taskType === workload.taskType);
    if (!hasMatchingTask) unscheduled.push(status.topicId);
  }
  return unscheduled;
}

// Mirrors lib/studyPlan.ts's own TASK_TYPE_TITLE wording (private to that module) — kept as a
// small, clearly-labelled local copy rather than exporting a new surface from studyPlan.ts, which
// this stage deliberately leaves completely unmodified.
const ADAPTIVE_TASK_TYPE_TITLE: Record<PlanTaskType, string> = {
  coverage: 'Study',
  revision: 'Revise',
  pyq_practice: 'Practice PYQs',
  review: 'Review',
};

function formatHours(minutes: number): string {
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}

/** A `PlanCapacity`-shaped view of only the days from `currentDate` onward — same invariants as
 * the real thing, so it can be handed straight to Stage 3's rebalanceStudyPlan unmodified. */
function remainingCapacityView(capacity: PlanCapacity, currentDate: string): PlanCapacity {
  const studyDayDates = capacity.studyDayDates.filter((d) => d >= currentDate);
  const totalAvailableMinutes = studyDayDates.length * capacity.minutesPerStudyDay;
  const plannableMinutes = Math.floor(totalAvailableMinutes * BUFFER_RATIO);
  return {
    totalCalendarDays: studyDayDates.length,
    studyWeekdays: capacity.studyWeekdays,
    studyDayDates,
    minutesPerStudyDay: capacity.minutesPerStudyDay,
    totalAvailableMinutes,
    plannableMinutes,
  };
}

/** Recalculates capacity from `currentDate` through the plan's target date — see GOAL #7. */
export function computeRemainingCapacity(
  capacity: PlanCapacity,
  currentDate: string,
  syllabusTasks: StudyPlanTask[],
  personalTasks: PersonalPlanTask[],
): RemainingCapacityReport {
  const remaining = remainingCapacityView(capacity, currentDate);
  const remainingPlannedMinutes =
    syllabusTasks.filter((t) => t.status === 'pending').reduce((sum, t) => sum + t.estimatedMinutes, 0) +
    personalTasks.filter((t) => t.status === 'pending').reduce((sum, t) => sum + t.estimatedMinutes, 0);

  const remainingDeficitMinutes = Math.max(0, remainingPlannedMinutes - remaining.totalAvailableMinutes);
  const remainingSurplusMinutes = Math.max(0, remaining.totalAvailableMinutes - remainingPlannedMinutes);
  const utilizationPct =
    remaining.totalAvailableMinutes > 0
      ? Math.round((remainingPlannedMinutes / remaining.totalAvailableMinutes) * 1000) / 10
      : remainingPlannedMinutes > 0
        ? 100
        : 0;

  let verdict: RemainingCapacityVerdict;
  let message: string;
  if (remainingPlannedMinutes === 0) {
    verdict = 'completed';
    message = 'No remaining work is currently planned.';
  } else if (remainingPlannedMinutes > remaining.totalAvailableMinutes) {
    verdict = 'over_capacity';
    message = `Remaining capacity is insufficient for the current workload — short by ${formatHours(remainingDeficitMinutes)}.`;
  } else if (remainingPlannedMinutes > remaining.plannableMinutes) {
    verdict = 'tight';
    message = 'Remaining work fits, but uses all your remaining time with no buffer left.';
  } else {
    verdict = 'on_track';
    message = 'You are on track to complete your remaining plan within your available time.';
  }

  return {
    remainingStudyDays: remaining.studyDayDates.length,
    remainingAvailableMinutes: remaining.totalAvailableMinutes,
    remainingPlannedMinutes,
    remainingDeficitMinutes,
    remainingSurplusMinutes,
    utilizationPct,
    verdict,
    message,
  };
}

function removalReason(task: StudyPlanTask, status: UnifiedTopicStatus): string {
  if (status.status === 'strong') {
    return task.taskType === 'coverage' ? 'Topic completed — future coverage removed.' : 'Topic is already strong — reduced future revision.';
  }
  return 'Topic status changed — this task no longer matches what the topic currently needs.';
}

function additionReason(status: UnifiedTopicStatus): string {
  if (status.status === 'needs_revision') return 'PYQ accuracy dropped — additional revision added.';
  if (status.status === 'needs_practice') return 'Needs more PYQ practice before accuracy can be judged.';
  if (status.status === 'needs_coverage') return 'Topic still needs coverage.';
  return 'Topic needs attention.';
}

/** Picks a phase for a newly-added task by matching an existing task of the same type in the
 * plan (if any) — never re-derives Stage 1's own phase-mode logic, which is private to it. */
function inferPhaseForTaskType(plan: StudyPlan, taskType: PlanTaskType): PlanPhaseId {
  const existing = plan.tasks.find((t) => t.taskType === taskType);
  if (existing) return existing.phase;
  if (plan.phases.some((p) => p.id === 'focused')) return 'focused';
  if (taskType === 'coverage') return 'coverage';
  if (taskType === 'revision') return plan.phases.some((p) => p.id === 'revision') ? 'revision' : 'consolidation';
  return 'consolidation';
}

/**
 * Computes the delta between what the plan currently schedules and what the student's CURRENT
 * progress says is actually needed, then reuses Stage 3's rebalanceStudyPlan to fit the result
 * into the remaining calendar. Never mutates its inputs; returns a full result for the caller
 * (store action) to persist.
 */
export function adaptStudyPlan(input: AdaptiveInput): AdaptiveResult {
  const { plan, personalTasks, syllabus, completedTopics, pyqPerf, currentDate } = input;

  const statuses = computeUnifiedTopicStatus(syllabus, completedTopics, pyqPerf);
  const statusByTopic = new Map(statuses.map((s) => [s.topicId, s]));
  const subjectByTopic = new Map(syllabus.flatMap((s) => s.topics.map((t) => [t.id, s.id])));

  const completed = plan.tasks.filter((t) => t.status !== 'pending');
  const pending = plan.tasks.filter((t) => t.status === 'pending');
  const missedTaskIds = pending.filter((t) => t.date < currentDate).map((t) => t.id);

  // Only topics the plan has already scheduled at least one task for are ever reconsidered — see
  // the module header for why brand-new topic discovery is deliberately out of scope here.
  const touchedTopicIds = [...new Set(plan.tasks.map((t) => t.topicId))];

  const changes: AdaptiveChange[] = [];
  const removedTaskIds: string[] = [];
  const keptPending: StudyPlanTask[] = [];

  for (const task of pending) {
    const status = statusByTopic.get(task.topicId);
    const workload = status ? estimateTopicWorkload(status) : null;
    if (status && workload && workload.taskType === task.taskType) {
      keptPending.push(task);
    } else if (status) {
      removedTaskIds.push(task.id);
      changes.push({ taskId: task.id, topicId: task.topicId, kind: 'removed', reason: removalReason(task, status) });
    } else {
      keptPending.push(task); // defensive: topic not found in current syllabus — leave untouched
    }
  }

  const maxPriority = plan.tasks.reduce((max, t) => Math.max(max, t.priority), 0);
  const remainingStudyDates = plan.capacity.studyDayDates.filter((d) => d >= currentDate);
  const placeholderDate = remainingStudyDates[0] ?? plan.capacity.studyDayDates[plan.capacity.studyDayDates.length - 1] ?? currentDate;

  const addedTasks: StudyPlanTask[] = [];
  let addedIndex = 0;
  for (const topicId of touchedTopicIds) {
    const status = statusByTopic.get(topicId);
    if (!status) continue;
    const workload = estimateTopicWorkload(status);
    if (!workload.taskType) continue; // strong -> nothing needed

    const hasPendingOfType = keptPending.some((t) => t.topicId === topicId && t.taskType === workload.taskType);
    const hasCompletedOfType = completed.some((t) => t.topicId === topicId && t.taskType === workload.taskType);
    if (hasPendingOfType || hasCompletedOfType) continue;

    const id = `${topicId}-${workload.taskType}`;
    if (plan.tasks.some((t) => t.id === id) || addedTasks.some((t) => t.id === id)) continue; // never a duplicate id

    const task: StudyPlanTask = {
      id,
      date: placeholderDate,
      topicId,
      subjectId: subjectByTopic.get(topicId) ?? '',
      phase: inferPhaseForTaskType(plan, workload.taskType),
      taskType: workload.taskType,
      title: `${ADAPTIVE_TASK_TYPE_TITLE[workload.taskType]}: ${status.topicTitle}`,
      estimatedMinutes: workload.estimatedMinutes,
      priority: maxPriority + 1 + addedIndex,
      status: 'pending',
      reason: workload.reason,
    };
    addedTasks.push(task);
    changes.push({ taskId: id, topicId, kind: 'added', reason: additionReason(status) });
    addedIndex++;
  }

  // Reuse Stage 3's own packing algorithm, unmodified, scoped to only the remaining calendar —
  // this is what naturally pulls missed (overdue) pending tasks forward to the next open day,
  // and what guarantees nothing is ever scheduled before `currentDate` or after the target date.
  const mergedTasks = [...completed, ...keptPending, ...addedTasks];
  const remainingCapacity = remainingCapacityView(plan.capacity, currentDate);
  const rebalance = rebalanceStudyPlan(remainingCapacity, mergedTasks);

  const originalById = new Map(plan.tasks.map((t) => [t.id, t]));
  const addedIds = new Set(addedTasks.map((t) => t.id));
  const movedTaskIds: string[] = [];
  const unchangedTaskIds: string[] = [];
  for (const t of rebalance.tasks) {
    if (t.status !== 'pending' || addedIds.has(t.id)) continue;
    const original = originalById.get(t.id);
    if (!original) continue;
    if (original.date === t.date) unchangedTaskIds.push(t.id);
    else movedTaskIds.push(t.id);
  }
  for (const id of movedTaskIds) {
    const t = rebalance.tasks.find((x) => x.id === id)!;
    changes.push({
      taskId: id,
      topicId: t.topicId,
      kind: 'moved',
      reason: missedTaskIds.includes(id) ? 'Task missed — moved to the next available study day.' : 'Moved to keep the schedule within your daily capacity.',
    });
  }

  const capacityReport = computeRemainingCapacity(plan.capacity, currentDate, rebalance.tasks, personalTasks);
  const unscheduledTopicIds = computeUnscheduledTopicIds(rebalance.tasks, syllabus, completedTopics, pyqPerf);

  const warnings: string[] = [];
  if (rebalance.unscheduledTaskIds.length > 0) {
    warnings.push(`${rebalance.unscheduledTaskIds.length} task(s) could not be scheduled before the target date.`);
  }
  if (capacityReport.verdict === 'over_capacity') warnings.push(capacityReport.message);

  return {
    updatedTasks: rebalance.tasks,
    removedTaskIds,
    addedTaskIds: addedTasks.map((t) => t.id),
    movedTaskIds,
    unchangedTaskIds,
    completedTaskIds: completed.map((t) => t.id),
    missedTaskIds,
    unscheduledTaskIds: rebalance.unscheduledTaskIds,
    unscheduledTopicIds,
    warnings,
    capacityReport,
    changes,
  };
}
