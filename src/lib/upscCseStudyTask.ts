// UPSC CSE Study Tasks — a deliberately minimal, lightweight daily task list (NOT the APFC study
// plan engine's auto-generated/adaptive PersonalPlanTask — see lib/studyPlan.ts, lib/
// studyPlanAdaptive.ts, lib/studyPlanEditing.ts for that much heavier, capacity-driven system).
// This module is the smallest thing that satisfies "daily study tasks: title, optional target/
// duration, status pending/completed, date" — a plain, user-authored todo item, nothing generated
// or auto-scheduled. Pure logic only; lib/store.ts owns persistence (upscCseStudyTasks, workspace-
// owned exactly like every other UPSC CSE field).

export type UpscCseStudyTaskStatus = 'pending' | 'completed';

export interface UpscCseStudyTask {
  id: string;
  /** yyyy-mm-dd — the day this task is planned for. */
  date: string;
  title: string;
  /** Optional target duration in minutes — freeform, never validated against real study time. */
  targetMinutes?: number;
  status: UpscCseStudyTaskStatus;
  createdAt: string;
  /** Set only when status is 'completed'; cleared (absent) when reverted to 'pending'. Never
   * fabricated — always the real moment the status actually changed, supplied by the caller. */
  completedAt?: string;
}

/** A task title is required and must be non-blank once trimmed — the one validation rule this
 * module enforces; everything else (targetMinutes) is optional and unconstrained. */
export function isValidStudyTaskTitle(title: string): boolean {
  return title.trim().length > 0;
}

/** Builds a new, unsaved task in 'pending' status. `id`/`createdAt` are supplied by the caller
 * (matching this app's existing convention — see e.g. PYQAttempt construction in
 * pages/UpscCsePyqTest.tsx — of generating uuid()/timestamp at the call site, never inside a pure
 * "pure" helper) rather than this function reaching for Date.now()/uuid() itself. */
export function createUpscCseStudyTask(input: { title: string; date: string; targetMinutes?: number }, id: string, createdAt: string): UpscCseStudyTask {
  return {
    id,
    date: input.date,
    title: input.title.trim(),
    targetMinutes: input.targetMinutes,
    status: 'pending',
    createdAt,
  };
}

/** Returns a NEW array with the matching task's status set — completedAt is stamped with `now`
 * when moving to 'completed', and cleared when reverting to 'pending'. Never mutates `tasks`. An
 * id that doesn't exist in `tasks` is a no-op (returns an equivalent array), never an error. */
export function setUpscCseStudyTaskStatus(
  tasks: readonly UpscCseStudyTask[],
  id: string,
  status: UpscCseStudyTaskStatus,
  now: string,
): UpscCseStudyTask[] {
  return tasks.map((t) => (t.id === id ? { ...t, status, completedAt: status === 'completed' ? now : undefined } : t));
}

export function deleteUpscCseStudyTask(tasks: readonly UpscCseStudyTask[], id: string): UpscCseStudyTask[] {
  return tasks.filter((t) => t.id !== id);
}

export function tasksForDate(tasks: readonly UpscCseStudyTask[], date: string): UpscCseStudyTask[] {
  return tasks.filter((t) => t.date === date);
}

export interface UpscCseStudyTaskCounts {
  pending: number;
  completed: number;
}

export function countStudyTasksByStatus(tasks: readonly UpscCseStudyTask[]): UpscCseStudyTaskCounts {
  return {
    pending: tasks.filter((t) => t.status === 'pending').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
  };
}

/** Most recently completed tasks first (by completedAt) — used for a dashboard's "recent activity"
 * view. Tasks with no completedAt (never completed) are excluded, never treated as "just now". */
export function recentlyCompletedStudyTasks(tasks: readonly UpscCseStudyTask[], limit: number): UpscCseStudyTask[] {
  return tasks
    .filter((t): t is UpscCseStudyTask & { completedAt: string } => t.status === 'completed' && t.completedAt !== undefined)
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
    .slice(0, limit);
}
