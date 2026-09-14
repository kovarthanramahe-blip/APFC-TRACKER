// Stage 3 of the Study Plan feature — editing and rebalancing an already-generated plan.
// lib/studyPlan.ts (Stage 1) remains the ONLY place plan generation happens; nothing here
// recomputes topic status, workload, or scheduling from scratch. This module only mutates an
// already-generated task list in small, explicit, pure ways, plus one bounded "repack the
// pending tasks that no longer fit" operation (rebalanceStudyPlan) that reuses the exact same
// PlanCapacity the engine already computed.
import type { PlanCapacity, PlanTaskStatus, StudyPlanTask } from './studyPlan';
import { uuid } from './utils';

// --- Personal tasks -----------------------------------------------------------
// A personal task is explicitly NOT a StudyPlanTask: it has no topicId/subjectId (never a fake
// syllabus reference) and its own taskType literal ('personal'), so it can never be confused with
// — or counted toward — syllabus coverage, which is computed by lib/topicStatus purely from
// completedTopics + PYQ performance and never looks at the task list at all.
export type PersonalTaskType = 'personal';

export interface PersonalPlanTask {
  id: string; // stable + unique — crypto.randomUUID via lib/utils's uuid(), the same convention
  // already used for every other user-authored record in this app (Note, PomodoroSession,
  // MockTestAttempt, PYQAttempt all get their id this way). A generated StudyPlanTask's id is
  // content-derived instead because that one must be deterministic across regenerations; a
  // personal task is a one-off user action, not a recomputation, so that concern doesn't apply.
  date: string; // yyyy-mm-dd
  title: string;
  estimatedMinutes: number;
  status: PlanTaskStatus;
  taskType: PersonalTaskType;
  reason: string;
}

export const MAX_TASK_MINUTES = 240; // 4 hours — a sensible upper bound for a single scheduled block

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDateStr(s: string): boolean {
  return DATE_RE.test(s) && !Number.isNaN(new Date(s + 'T00:00:00').getTime());
}

export interface AddPersonalTaskInput {
  title: string;
  date: string;
  estimatedMinutes: number;
}

export function addPersonalStudyPlanTask(existing: PersonalPlanTask[], input: AddPersonalTaskInput): TaskEditResult<PersonalPlanTask> {
  const title = input.title.trim();
  if (!title) return { tasks: existing, ok: false, error: 'Title is required.' };
  if (!isValidDateStr(input.date)) return { tasks: existing, ok: false, error: 'A valid date is required.' };
  if (!Number.isInteger(input.estimatedMinutes) || input.estimatedMinutes <= 0) {
    return { tasks: existing, ok: false, error: 'Minutes must be a positive whole number.' };
  }
  if (input.estimatedMinutes > MAX_TASK_MINUTES) {
    return { tasks: existing, ok: false, error: `Minutes cannot exceed ${MAX_TASK_MINUTES}.` };
  }

  const task: PersonalPlanTask = {
    id: uuid(),
    date: input.date,
    title,
    estimatedMinutes: input.estimatedMinutes,
    status: 'pending',
    taskType: 'personal',
    reason: 'Added by you.',
  };
  return { tasks: [...existing, task], ok: true };
}

// --- Shared editing primitives -------------------------------------------------
// Both StudyPlanTask and PersonalPlanTask structurally satisfy this — these functions work
// identically on either array without needing StudyPlanTask itself to change at all.
interface EditableTaskLike {
  id: string;
  date: string;
  estimatedMinutes: number;
  status: PlanTaskStatus;
}

export interface TaskEditResult<T> {
  tasks: T[];
  ok: boolean;
  error?: string;
  /** Set when the edit succeeded but has a side effect worth surfacing (e.g. a day is now over
   * capacity) — never blocks the edit, just makes it visible rather than hiding it. */
  warning?: string;
}

/** The one place every other editing function goes through to actually patch a task — keeps a
 * single, shared "find by id and replace" implementation rather than duplicating it per operation. */
export function updateStudyPlanTask<T extends EditableTaskLike>(tasks: T[], taskId: string, patch: Partial<Omit<T, 'id'>>): TaskEditResult<T> {
  const idx = tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return { tasks, ok: false, error: 'Task not found.' };
  const next = [...tasks];
  next[idx] = { ...next[idx], ...patch };
  return { tasks: next, ok: true };
}

function findTask<T extends EditableTaskLike>(tasks: T[], taskId: string): T | undefined {
  return tasks.find((t) => t.id === taskId);
}

// --- Mark complete / reopen ----------------------------------------------------
// pending -> completed and back. The task's date, estimated duration and identity (id, topicId,
// title, everything else) are untouched — only `status` changes, so nothing about the task is
// silently regenerated.
export function completeStudyPlanTask<T extends EditableTaskLike>(tasks: T[], taskId: string): TaskEditResult<T> {
  const task = findTask(tasks, taskId);
  if (!task) return { tasks, ok: false, error: 'Task not found.' };
  if (task.status === 'completed') return { tasks, ok: true }; // already there — idempotent no-op
  return updateStudyPlanTask(tasks, taskId, { status: 'completed' } as Partial<Omit<T, 'id'>>);
}

export function reopenStudyPlanTask<T extends EditableTaskLike>(tasks: T[], taskId: string): TaskEditResult<T> {
  const task = findTask(tasks, taskId);
  if (!task) return { tasks, ok: false, error: 'Task not found.' };
  if (task.status === 'pending') return { tasks, ok: true };
  return updateStudyPlanTask(tasks, taskId, { status: 'pending' } as Partial<Omit<T, 'id'>>);
}

// --- Move / postpone -------------------------------------------------------------
/**
 * Moves a PENDING task to a new date. Rejects moving a completed task (protected) and rejects a
 * date that isn't a configured study day when `validStudyDates` is supplied (pass it for
 * syllabus tasks; omit it for personal tasks, which aren't bound to the plan's study-day set).
 *
 * Deliberately does NOT auto-redirect to a different day when the chosen date is already full —
 * that would silently override the user's explicit choice. Instead it succeeds with a `warning`
 * so the day's over-capacity state is visible immediately; the user can then use "Rebalance
 * Remaining Plan" if they want the schedule redistributed automatically. Never duplicates the task
 * — the same task object's date field is updated in place.
 */
export function moveStudyPlanTask<T extends EditableTaskLike>(
  tasks: T[],
  taskId: string,
  newDate: string,
  options?: { validStudyDates?: string[]; minutesPerStudyDay?: number },
): TaskEditResult<T> {
  const task = findTask(tasks, taskId);
  if (!task) return { tasks, ok: false, error: 'Task not found.' };
  if (task.status !== 'pending') return { tasks, ok: false, error: 'Only pending tasks can be moved.' };
  if (!isValidDateStr(newDate)) return { tasks, ok: false, error: 'A valid date is required.' };
  if (options?.validStudyDates && !options.validStudyDates.includes(newDate)) {
    return { tasks, ok: false, error: 'That date is not a configured study day for this plan.' };
  }

  const result = updateStudyPlanTask(tasks, taskId, { date: newDate } as Partial<Omit<T, 'id'>>);
  if (!result.ok || options?.minutesPerStudyDay == null) return result;

  const usedOnNewDate = result.tasks.filter((t) => t.date === newDate).reduce((sum, t) => sum + t.estimatedMinutes, 0);
  if (usedOnNewDate > options.minutesPerStudyDay) {
    return { ...result, warning: `${newDate} is now over your planned daily capacity.` };
  }
  return result;
}

// --- Resize --------------------------------------------------------------------
export function resizeStudyPlanTask<T extends EditableTaskLike>(
  tasks: T[],
  taskId: string,
  minutes: number,
  minutesPerStudyDay?: number,
): TaskEditResult<T> {
  const task = findTask(tasks, taskId);
  if (!task) return { tasks, ok: false, error: 'Task not found.' };
  if (task.status !== 'pending') return { tasks, ok: false, error: 'Only pending tasks can be resized.' };
  if (!Number.isInteger(minutes) || minutes <= 0) return { tasks, ok: false, error: 'Minutes must be a positive whole number.' };
  if (minutes > MAX_TASK_MINUTES) return { tasks, ok: false, error: `Minutes cannot exceed ${MAX_TASK_MINUTES}.` };

  const result = updateStudyPlanTask(tasks, taskId, { estimatedMinutes: minutes } as Partial<Omit<T, 'id'>>);
  if (!result.ok || minutesPerStudyDay == null) return result;

  const usedOnDate = result.tasks.filter((t) => t.date === task.date).reduce((sum, t) => sum + t.estimatedMinutes, 0);
  if (usedOnDate > minutesPerStudyDay) {
    return { ...result, warning: `${task.date} is now over your planned daily capacity.` };
  }
  return result;
}

// --- Remove ----------------------------------------------------------------------
/**
 * Removes a PENDING task from the schedule — this only means "no longer scheduled", never
 * touches the underlying syllabus (completedTopics, PYQ performance) the task was derived from,
 * so the topic itself is untouched and can still appear in a future regenerate/rebalance.
 * Completed tasks are fully protected: reopen first if it needs to be removed.
 */
export function removeStudyPlanTask<T extends EditableTaskLike>(tasks: T[], taskId: string): TaskEditResult<T> {
  const task = findTask(tasks, taskId);
  if (!task) return { tasks, ok: false, error: 'Task not found.' };
  if (task.status !== 'pending') {
    return { tasks, ok: false, error: 'Completed tasks are protected from removal — reopen it first if you need to remove it.' };
  }
  return { tasks: tasks.filter((t) => t.id !== taskId), ok: true };
}

// --- Rebalance ---------------------------------------------------------------------
export interface RebalanceResult {
  tasks: StudyPlanTask[];
  /** How many pending tasks actually changed date — 0 means nothing needed to move. */
  movedCount: number;
  /** Pending tasks that could not be placed anywhere before the target date — reported, never
   * silently dropped. */
  unscheduledTaskIds: string[];
}

/**
 * Repacks only the PENDING tasks so they fit within the plan's existing capacity — never a full
 * regeneration. Rules (see Stage 3 spec):
 *  - completed/skipped tasks are never touched (their date/duration/status are fixed points the
 *    algorithm builds around, and their minutes reserve real capacity on their day)
 *  - a pending task keeps its current date whenever that day still has room for it — most tasks
 *    move zero times; this is deliberately NOT the Stage-1 "rebuild from scratch" packing
 *  - a task that no longer fits its day moves FORWARD to the next study day (chronologically, at
 *    or after its own date) that has room — never earlier, never onto a rest day
 *  - processing order is each task's own `priority` (fixed at generation time), so the same input
 *    always produces the same output
 *  - never raises the per-day cap (`capacity.minutesPerStudyDay`) to make something fit
 *  - a task that truly cannot fit anywhere before the target date is reported in
 *    `unscheduledTaskIds`, never silently dropped from the array
 */
export function rebalanceStudyPlan(capacity: PlanCapacity, tasks: StudyPlanTask[]): RebalanceResult {
  const fixed = tasks.filter((t) => t.status !== 'pending');
  const pending = [...tasks.filter((t) => t.status === 'pending')].sort((a, b) => a.priority - b.priority);

  const studyDates = capacity.studyDayDates;
  const dailyCap = capacity.minutesPerStudyDay;

  const usedByDate = new Map<string, number>();
  for (const date of studyDates) usedByDate.set(date, 0);
  for (const t of fixed) {
    if (usedByDate.has(t.date)) usedByDate.set(t.date, (usedByDate.get(t.date) ?? 0) + t.estimatedMinutes);
  }

  const resultTasks: StudyPlanTask[] = [...fixed];
  let movedCount = 0;
  const unscheduledTaskIds: string[] = [];

  for (const task of pending) {
    const stillFits = usedByDate.has(task.date) && (usedByDate.get(task.date) ?? 0) + task.estimatedMinutes <= dailyCap;
    let targetDate: string | null = null;

    if (stillFits) {
      targetDate = task.date;
    } else {
      const startIdx = Math.max(0, studyDates.indexOf(task.date));
      for (let i = startIdx; i < studyDates.length; i++) {
        const d = studyDates[i];
        if ((usedByDate.get(d) ?? 0) + task.estimatedMinutes <= dailyCap) {
          targetDate = d;
          break;
        }
      }
    }

    if (targetDate === null) {
      unscheduledTaskIds.push(task.id);
      continue;
    }

    usedByDate.set(targetDate, (usedByDate.get(targetDate) ?? 0) + task.estimatedMinutes);
    if (targetDate !== task.date) movedCount++;
    resultTasks.push(targetDate === task.date ? task : { ...task, date: targetDate });
  }

  return { tasks: resultTasks, movedCount, unscheduledTaskIds };
}

// --- Capacity after editing ---------------------------------------------------
export type EditedCapacityVerdict = 'comfortable' | 'tight' | 'insufficient';

export interface EditedCapacityReport {
  totalAvailableMinutes: number;
  plannedPendingMinutes: number;
  completedMinutes: number;
  totalPlannedMinutes: number;
  overCapacityMinutes: number;
  verdict: EditedCapacityVerdict;
  message: string;
}

/**
 * The live capacity picture AFTER edits — separate from the engine's original, frozen
 * `StudyPlan.capacityReport` (which reflects what was true at generation time). Includes personal
 * tasks in the planned-minutes totals, since they occupy real scheduled time too.
 */
export function computeEditedCapacity(capacity: PlanCapacity, tasks: EditableTaskLike[]): EditedCapacityReport {
  const completedMinutes = tasks.filter((t) => t.status !== 'pending').reduce((sum, t) => sum + t.estimatedMinutes, 0);
  const plannedPendingMinutes = tasks.filter((t) => t.status === 'pending').reduce((sum, t) => sum + t.estimatedMinutes, 0);
  const totalPlannedMinutes = completedMinutes + plannedPendingMinutes;
  const overCapacityMinutes = Math.max(0, totalPlannedMinutes - capacity.totalAvailableMinutes);
  const hours = (m: number) => Math.round((m / 60) * 10) / 10;

  let verdict: EditedCapacityVerdict;
  let message: string;
  if (totalPlannedMinutes <= capacity.plannableMinutes) {
    verdict = 'comfortable';
    message = 'Your current plan fits comfortably within your available study time.';
  } else if (totalPlannedMinutes <= capacity.totalAvailableMinutes) {
    verdict = 'tight';
    message = 'Your current plan fits, but uses all your available time with no buffer left.';
  } else {
    verdict = 'insufficient';
    message = `Your current plan exceeds your available study capacity by ${hours(overCapacityMinutes)}h.`;
  }

  return { totalAvailableMinutes: capacity.totalAvailableMinutes, plannedPendingMinutes, completedMinutes, totalPlannedMinutes, overCapacityMinutes, verdict, message };
}
