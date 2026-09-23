// Generic Micro-Target model — a small, reusable "target" data shape (title, optional description,
// optional target date, optional estimated effort, status, priority, created/completed timestamps)
// deliberately NOT tied to any one workspace's own entity types. Today it is used only by the PhD
// Research workspace (lib/store.ts's `phdMicroTargets`), but the type/logic here carries no PhD-
// specific field — a future workspace that wants its own lightweight target list can reuse this
// exact module for its own, separately-stored array, rather than this app growing three unrelated
// CRUD implementations for what is structurally the same small record. Storage itself still stays
// strictly per-workspace (its own array, archived/restored by the same workspace-owned swap every
// other collection uses) — this module only shares the shape and the pure logic, never the data.
//
// Deliberately NOT the same thing as UPSC CSE's lib/upscCseStudyTask.ts (title/date/status only, no
// description/priority/context) or APFC's much heavier lib/studyPlan.ts engine (auto-generated,
// capacity-aware scheduling) — this module is for a small, explicitly user-authored target with a
// few more optional fields than a bare task, matching what this stage's PhD micro-targets need.
//
// Same deterministic discipline as lib/upscCseStudyTask.ts and lib/revisionQueue.ts: no
// Date.now()/new Date().toISOString() calls in here — every timestamp is supplied by the caller.

export type MicroTargetStatus = 'pending' | 'in_progress' | 'completed';
export type MicroTargetPriority = 'low' | 'medium' | 'high';

export interface MicroTarget {
  id: string;
  title: string;
  description?: string;
  /** Optional workspace-specific context/entity reference — e.g. a PhD Topic Area id (see
   * lib/phdTopicArea.ts). Deliberately just a plain string id with no assumed shape, so this module
   * never needs to know about any particular workspace's own entity types. */
  contextId?: string;
  /** yyyy-mm-dd — optional; a target with no date is never treated as overdue or upcoming. */
  targetDate?: string;
  estimatedMinutes?: number;
  status: MicroTargetStatus;
  priority: MicroTargetPriority;
  createdAt: string;
  /** Set only when status is 'completed'; cleared when reverted. Never fabricated. */
  completedAt?: string;
}

export function isValidMicroTargetTitle(title: string): boolean {
  return title.trim().length > 0;
}

export interface CreateMicroTargetInput {
  title: string;
  description?: string;
  contextId?: string;
  targetDate?: string;
  estimatedMinutes?: number;
  priority?: MicroTargetPriority;
}

export function createMicroTarget(input: CreateMicroTargetInput, id: string, createdAt: string): MicroTarget {
  return {
    id,
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    contextId: input.contextId,
    targetDate: input.targetDate,
    estimatedMinutes: input.estimatedMinutes,
    status: 'pending',
    priority: input.priority ?? 'medium',
    createdAt,
  };
}

export type UpdateMicroTargetFields = Partial<Pick<MicroTarget, 'title' | 'description' | 'contextId' | 'targetDate' | 'estimatedMinutes' | 'priority'>>;

/** Returns a NEW array with the matching target's editable fields updated — never mutates
 * `targets`. An id that doesn't exist is a no-op. Title, if supplied, is trimmed and never allowed
 * to become blank (a blank/whitespace-only title update is silently ignored, keeping the existing
 * one, rather than leaving the record in an invalid state). */
export function updateMicroTarget(targets: readonly MicroTarget[], id: string, updates: UpdateMicroTargetFields): MicroTarget[] {
  return targets.map((t) => {
    if (t.id !== id) return t;
    const nextTitle = updates.title !== undefined && isValidMicroTargetTitle(updates.title) ? updates.title.trim() : t.title;
    return {
      ...t,
      ...updates,
      title: nextTitle,
      description: updates.description !== undefined ? updates.description.trim() || undefined : t.description,
    };
  });
}

/** Returns a NEW array with the matching target's status set — completedAt is stamped with `now`
 * moving to 'completed', cleared reverting to pending/in_progress. Never mutates `targets`. */
export function setMicroTargetStatus(targets: readonly MicroTarget[], id: string, status: MicroTargetStatus, now: string): MicroTarget[] {
  return targets.map((t) => (t.id === id ? { ...t, status, completedAt: status === 'completed' ? now : undefined } : t));
}

export function deleteMicroTarget(targets: readonly MicroTarget[], id: string): MicroTarget[] {
  return targets.filter((t) => t.id !== id);
}

export function activeMicroTargets(targets: readonly MicroTarget[]): MicroTarget[] {
  return targets.filter((t) => t.status !== 'completed');
}

/** Active (pending/in_progress) targets whose targetDate has already passed `today` — a target
 * with no targetDate is never overdue. */
export function overdueMicroTargets(targets: readonly MicroTarget[], today: string): MicroTarget[] {
  return targets.filter((t) => t.status !== 'completed' && t.targetDate !== undefined && t.targetDate < today);
}

/** Active targets with a targetDate today or in the future, soonest first — a target with no
 * targetDate is never "upcoming" (it has nothing to be soon relative to). */
export function upcomingMicroTargets(targets: readonly MicroTarget[], today: string, limit?: number): MicroTarget[] {
  const upcoming = targets
    .filter((t) => t.status !== 'completed' && t.targetDate !== undefined && t.targetDate >= today)
    .sort((a, b) => a.targetDate!.localeCompare(b.targetDate!));
  return limit !== undefined ? upcoming.slice(0, limit) : upcoming;
}

/** Completed targets, most recently completed first — targets with no completedAt (shouldn't occur
 * given setMicroTargetStatus's own discipline, but never assumed) are excluded rather than treated
 * as "just now". */
export function recentlyCompletedMicroTargets(targets: readonly MicroTarget[], limit?: number): MicroTarget[] {
  const completed = targets
    .filter((t): t is MicroTarget & { completedAt: string } => t.status === 'completed' && t.completedAt !== undefined)
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  return limit !== undefined ? completed.slice(0, limit) : completed;
}

export interface MicroTargetCounts {
  pending: number;
  in_progress: number;
  completed: number;
}

export function countMicroTargetsByStatus(targets: readonly MicroTarget[]): MicroTargetCounts {
  return {
    pending: targets.filter((t) => t.status === 'pending').length,
    in_progress: targets.filter((t) => t.status === 'in_progress').length,
    completed: targets.filter((t) => t.status === 'completed').length,
  };
}

export function microTargetsForContext(targets: readonly MicroTarget[], contextId: string): MicroTarget[] {
  return targets.filter((t) => t.contextId === contextId);
}
