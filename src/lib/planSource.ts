// Shared Planning Utilities — the narrowly-scoped extraction approved after the read-only
// PlanSource architecture review. This module contains ONLY the pure, domain-agnostic operations
// that were verified to have IDENTICAL semantics across lib/upscCseStudyTask.ts (UPSC CSE) and
// lib/microTarget.ts (PhD Research). It deliberately does NOT include a PlanSource adapter, does
// not touch lib/studyPlan.ts/studyPlanAdaptive.ts/studyPlanEditing.ts or any generation/scheduling
// logic, and is not yet called from anywhere — this is step 1 of the migration order the review
// recommended: additive, unwired, zero risk to any existing planner.
//
// Status union is deliberately generic (`S extends string`), never a hardcoded superset: APFC's
// StudyPlanTask/PersonalPlanTask status is 'pending'|'completed'|'skipped' (no 'in_progress');
// UPSC's UpscCseStudyTask and PhD's MicroTarget are both 'pending'|'in_progress'|'completed' (no
// 'skipped'). Only the literal 'completed' is treated as a shared, cross-domain-verified value —
// every domain's status type genuinely has that exact member, and it means the same thing in all
// three. No other status value is assumed to exist, or forced to exist, across domains.
//
// Two exceptions were found and are deliberately NOT built into this module — see the doc comment
// on each function below for which domains were actually compared, and the final report for the
// full detail on why APFC's own overdue concept and its unknown-id convention are not yet safe to
// fold in here.

/** The smallest structural shape these utilities need. Every real domain type (StudyPlanTask,
 * PersonalPlanTask, UpscCseStudyTask, MicroTarget) already has `id`/`status`, and already has
 * SOME date-like field, though not always named `date` (MicroTarget's is `targetDate`) — so this
 * type is not yet something any domain's real array structurally satisfies without a rename/
 * projection. That mapping is deliberately out of scope here (it's exactly what a future
 * PlanSource adapter would do); this module only defines and tests the utilities themselves. */
export interface PlannableItem<S extends string = string> {
  id: string;
  status: S;
  /** yyyy-mm-dd, optional — an item with no date is never overdue or upcoming. */
  date?: string;
  completedAt?: string;
}

/**
 * Verified against: lib/upscCseStudyTask.ts's `overdueStudyTasks` and lib/microTarget.ts's
 * `overdueMicroTargets` — both filter to "not completed, has a date, date is before `today`",
 * with no sorting (callers get them in whatever order they were in the source array).
 *
 * NOT verified against APFC: lib/studyPlan.ts has no standalone overdue function at all. Its
 * closest analogues — studyPlanAdaptive.ts's `missedTaskIds` and studyPlanProgress.ts's
 * `computeOverdue` — both filter on `status === 'pending'` specifically, not "not completed".
 * Once a 'skipped' status is in play (as it is for APFC's StudyPlanTask/PersonalPlanTask), those
 * two predicates diverge: a skipped-but-still-dated-in-the-past task would be "overdue" under
 * this function but is deliberately excluded under APFC's own existing logic. Do not use this for
 * APFC without resolving that difference first — see the report's reported exception.
 */
export function overdueItems<S extends string, T extends PlannableItem<S>>(items: readonly T[], today: string): T[] {
  return items.filter((item) => item.status !== ('completed' as S) && item.date !== undefined && item.date < today);
}

/**
 * Verified against: lib/upscCseStudyTask.ts's `upcomingStudyTasks` and lib/microTarget.ts's
 * `upcomingMicroTargets` — both filter to "not completed, has a date, date is on/after `today`",
 * sort ascending by date, and apply an optional `limit` via `.slice(0, limit)`. Identical in both.
 */
export function upcomingItems<S extends string, T extends PlannableItem<S>>(items: readonly T[], today: string, limit?: number): T[] {
  const upcoming = items
    .filter((item) => item.status !== ('completed' as S) && item.date !== undefined && item.date >= today)
    .sort((a, b) => a.date!.localeCompare(b.date!));
  return limit !== undefined ? upcoming.slice(0, limit) : upcoming;
}

/**
 * A generic status tally. Unlike lib/upscCseStudyTask.ts's `countStudyTasksByStatus` and
 * lib/microTarget.ts's `countMicroTargetsByStatus` — both of which always return a FIXED
 * pending/in_progress/completed shape, zero-filled even for a status with no matching items —
 * this only returns a key for a status that actually occurred at least once. That's deliberate:
 * the status union `S` is generic and must never presuppose which specific statuses a given
 * domain has (APFC's 'skipped', UPSC/PhD's 'in_progress') or invent a fourth one. This is
 * therefore not yet a drop-in replacement for either existing function — a caller that needs the
 * old zero-filled shape would need to zero-fill the specific keys it expects itself.
 */
export function countByStatus<S extends string>(items: readonly { status: S }[]): Partial<Record<S, number>> {
  const counts: Partial<Record<S, number>> = {};
  for (const item of items) {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
  }
  return counts;
}

/**
 * Verified against: lib/upscCseStudyTask.ts's `setUpscCseStudyTaskStatus` and lib/microTarget.ts's
 * `setMicroTargetStatus` — both: find by id, set `status`, stamp `completedAt` with `now` only
 * when the new status is 'completed', clear it (set to undefined) otherwise. Never mutates
 * `items`. An id that doesn't exist in `items` is a silent no-op — `.map()` returns a new array of
 * otherwise-unchanged items — matching both of those functions' own documented convention exactly.
 *
 * NOT verified against APFC: lib/studyPlanEditing.ts's `completeStudyPlanTask`/`reopenStudyPlanTask`
 * use a DIFFERENT convention for an unknown id — they return `{ tasks, ok: false, error: 'Task not
 * found.' }` (an explicit, typed error result), not a silent no-op. That's a different return
 * SHAPE (a wrapped `TaskEditResult<T>`, not a bare array), not just a different behaviour, so it
 * cannot be reconciled by tweaking a predicate the way the overdue exception above can be
 * described — see the report's reported exception for why this was left out rather than forced.
 */
export function setStatusWithTimestamp<S extends string, T extends PlannableItem<S>>(items: readonly T[], id: string, status: S, now: string): T[] {
  return items.map((item) => (item.id === id ? { ...item, status, completedAt: status === ('completed' as S) ? now : undefined } : item));
}
