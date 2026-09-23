// UPSC CSE Study Tasks — a deliberately minimal, lightweight daily task list (NOT the APFC study
// plan engine's auto-generated/adaptive PersonalPlanTask — see lib/studyPlan.ts, lib/
// studyPlanAdaptive.ts, lib/studyPlanEditing.ts for that much heavier, capacity-driven system).
// This module started as "daily study tasks: title, optional target/duration, status
// pending/completed, date" for the Study Dashboard's quick-add Today's Tasks list, and is now ALSO
// the data model behind the fuller UPSC CSE Study Plan page (lib/upscCseStudyPlanGenerator.ts) —
// reusing the SAME store field/type rather than a second, parallel task list. Every field the
// Dashboard's simple quick-add already relies on (title/date/targetMinutes/status/createdAt/
// completedAt) is untouched; the Study Plan's own richer fields (syllabus linkage, priority,
// notes, in_progress status) are all OPTIONAL additions a quick-add task simply never sets.
import type { MicroTargetPriority } from './microTarget';

export type UpscCseStudyTaskStatus = 'pending' | 'in_progress' | 'completed';

export interface UpscCseStudyTask {
  id: string;
  /** yyyy-mm-dd — the day this task is planned for. */
  date: string;
  title: string;
  /** Optional target duration in minutes — freeform, never validated against real study time. */
  targetMinutes?: number;
  status: UpscCseStudyTaskStatus;
  createdAt: string;
  /** Set only when status is 'completed'; cleared (absent) when reverted to a non-completed
   * status. Never fabricated — always the real moment the status actually changed, supplied by
   * the caller. */
  completedAt?: string;
  priority?: MicroTargetPriority;
  /** Freeform organisation label — e.g. "History", "Polity" — set by the Study Plan when a task is
   * generated/linked from a real syllabus subject; never required. */
  subject?: string;
  /** A real id from data/upscCsePrelimsSyllabus.ts / data/upscCseMainsSyllabus.ts — set only when
   * this task was linked to (or generated from) an actual microsyllabus item. */
  microsyllabusId?: string;
  /** A real id from lib/upscCseGranularSyllabus.ts's UPSC_CSE_GRANULAR_NODES (a topic, subtopic, or
   * micro-topic) — its own node already carries its full parent chain (including
   * microsyllabusId), so linking a granular node also implies which microsyllabus item it belongs
   * to. Set only when the task was linked to an actual granular node. */
  granularNodeId?: string;
  /** Freeform user notes — distinct from `title` (the short task name); optional. */
  notes?: string;
  /** Where "Practice / Revise" on this task should navigate — always one of this app's own real
   * deep-link hrefs (see lib/upscCsePrelimsPyqFilters.ts's parseRevisionFilterParam and
   * pages/UpscCsePyqTest.tsx's own query-param handling), never a fabricated destination. */
  linkedActionHref?: string;
}

/** A task title is required and must be non-blank once trimmed — the one validation rule this
 * module enforces; everything else (targetMinutes) is optional and unconstrained. */
export function isValidStudyTaskTitle(title: string): boolean {
  return title.trim().length > 0;
}

export interface CreateUpscCseStudyTaskInput {
  title: string;
  date: string;
  targetMinutes?: number;
  priority?: MicroTargetPriority;
  subject?: string;
  microsyllabusId?: string;
  granularNodeId?: string;
  notes?: string;
  linkedActionHref?: string;
}

/** Builds a new, unsaved task in 'pending' status. `id`/`createdAt` are supplied by the caller
 * (matching this app's existing convention — see e.g. PYQAttempt construction in
 * pages/UpscCsePyqTest.tsx — of generating uuid()/timestamp at the call site, never inside a pure
 * "pure" helper) rather than this function reaching for Date.now()/uuid() itself. */
export function createUpscCseStudyTask(input: CreateUpscCseStudyTaskInput, id: string, createdAt: string): UpscCseStudyTask {
  return {
    id,
    date: input.date,
    title: input.title.trim(),
    targetMinutes: input.targetMinutes,
    status: 'pending',
    createdAt,
    priority: input.priority,
    subject: input.subject,
    microsyllabusId: input.microsyllabusId,
    granularNodeId: input.granularNodeId,
    notes: input.notes?.trim() || undefined,
    linkedActionHref: input.linkedActionHref,
  };
}

/** Returns a NEW array with the matching task's status set — completedAt is stamped with `now`
 * when moving to 'completed', and cleared when reverting to a non-completed status. Never mutates
 * `tasks`. An id that doesn't exist in `tasks` is a no-op (returns an equivalent array), never an
 * error. */
export function setUpscCseStudyTaskStatus(
  tasks: readonly UpscCseStudyTask[],
  id: string,
  status: UpscCseStudyTaskStatus,
  now: string,
): UpscCseStudyTask[] {
  return tasks.map((t) => (t.id === id ? { ...t, status, completedAt: status === 'completed' ? now : undefined } : t));
}

export type UpdateUpscCseStudyTaskFields = Partial<
  Pick<UpscCseStudyTask, 'title' | 'date' | 'targetMinutes' | 'priority' | 'subject' | 'microsyllabusId' | 'granularNodeId' | 'notes' | 'linkedActionHref'>
>;

/** Returns a NEW array with the matching task's editable fields updated. Title, if supplied, is
 * trimmed and never allowed to become blank (a blank update is silently ignored, keeping the
 * existing title). Never mutates `tasks`. */
export function updateUpscCseStudyTask(tasks: readonly UpscCseStudyTask[], id: string, updates: UpdateUpscCseStudyTaskFields): UpscCseStudyTask[] {
  return tasks.map((t) => {
    if (t.id !== id) return t;
    const nextTitle = updates.title !== undefined && isValidStudyTaskTitle(updates.title) ? updates.title.trim() : t.title;
    return { ...t, ...updates, title: nextTitle, notes: updates.notes !== undefined ? updates.notes.trim() || undefined : t.notes };
  });
}

export function deleteUpscCseStudyTask(tasks: readonly UpscCseStudyTask[], id: string): UpscCseStudyTask[] {
  return tasks.filter((t) => t.id !== id);
}

export function tasksForDate(tasks: readonly UpscCseStudyTask[], date: string): UpscCseStudyTask[] {
  return tasks.filter((t) => t.date === date);
}

/** Active (pending/in_progress) tasks whose planned date has already passed `today`. */
export function overdueStudyTasks(tasks: readonly UpscCseStudyTask[], today: string): UpscCseStudyTask[] {
  return tasks.filter((t) => t.status !== 'completed' && t.date < today);
}

/** Active tasks planned today or later, soonest first. */
export function upcomingStudyTasks(tasks: readonly UpscCseStudyTask[], today: string, limit?: number): UpscCseStudyTask[] {
  const upcoming = tasks.filter((t) => t.status !== 'completed' && t.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  return limit !== undefined ? upcoming.slice(0, limit) : upcoming;
}

export interface UpscCseStudyTaskCounts {
  pending: number;
  in_progress: number;
  completed: number;
}

export function countStudyTasksByStatus(tasks: readonly UpscCseStudyTask[]): UpscCseStudyTaskCounts {
  return {
    pending: tasks.filter((t) => t.status === 'pending').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
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
