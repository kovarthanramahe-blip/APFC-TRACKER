// Stage 7 of the Study Plan feature — a daily VIEW over the existing plan, answering "what should I
// study today?". This is not a new schedule and never rewrites one: it only reads plan.tasks,
// personalTasks, and the same topic-status/PYQ-performance sources Stages 1-6 already use, and
// derives a same-day queue from them. Pure and deterministic — no Date.now(); `currentDate` is
// always supplied by the caller. Nothing here mutates the plan, moves a task, or marks anything
// complete; UI actions (Complete/Adapt/Rebalance) remain exactly the existing store actions.
//
// Reuses, never duplicates:
//  - lib/topicStatus's computeUnifiedTopicStatus for per-topic status (used only to add a more
//    specific "reason" — e.g. distinguishing "Weak PYQ performance" from a generic "Needs
//    revision" — never to re-derive which tasks exist)
//  - lib/studyPlan's StudyPlanTask/PlanTaskType and lib/studyPlanEditing's PersonalPlanTask as the
//    only two task shapes — no third, synthetic task type is invented
import type { PlanTaskType, StudyPlan, StudyPlanTask } from './studyPlan';
import type { PersonalPlanTask } from './studyPlanEditing';
import { computeUnifiedTopicStatus, MIN_PYQ_ATTEMPTS_FOR_SIGNAL, type UnifiedTopicStatus } from './topicStatus';
import type { PyqPerformanceSnapshot } from './pyqPerformance';
import type { SyllabusSubject } from './types';

export interface DailyQueueInput {
  plan: StudyPlan | null;
  personalTasks: PersonalPlanTask[];
  syllabus: SyllabusSubject[];
  completedTopics: Record<string, boolean>;
  pyqPerf: PyqPerformanceSnapshot | null;
  /** yyyy-mm-dd — the caller's "today". Never inferred internally, so this module stays pure. */
  currentDate: string;
}

// --- Queue item model (GOAL #9) ------------------------------------------------------------------
export type DailyQueueSource = 'study_plan' | 'personal';

export interface DailyQueueItem {
  /** `${source}:${task.id}` — namespaced so a syllabus task id and a personal task id can never
   * collide, even though in practice their id schemes already don't overlap. */
  id: string;
  source: DailyQueueSource;
  task: StudyPlanTask | PersonalPlanTask;
  /** Lower = higher priority. See ITEM_RANK below for the exact, documented ordering. */
  priority: number;
  reason: string;
  overdue: boolean;
  estimatedMinutes: number;
}

// --- Priority (GOAL #3) ------------------------------------------------------------------------
// Overdue work always comes first, regardless of type. Within non-overdue work, syllabus tasks are
// ranked by their taskType — which lib/studyPlan's estimateTopicWorkload already derives from
// unified topic status (coverage <- not_started/needs_coverage, revision <- needs_revision,
// pyq_practice <- needs_practice) — so this ranking reuses that classification rather than
// re-deriving "needs coverage/revision/practice" from scratch. Personal tasks rank last, matching
// the spec's suggested order; 'review' is a reserved PlanTaskType lib/studyPlan doesn't currently
// generate, ranked just above personal tasks for completeness.
const TASK_TYPE_RANK: Record<PlanTaskType, number> = { coverage: 0, revision: 1, pyq_practice: 2, review: 3 };
const PERSONAL_RANK = 10;

function itemRank(source: DailyQueueSource, task: StudyPlanTask | PersonalPlanTask, overdue: boolean): number {
  if (overdue) return -1; // always first — see GOAL #3's "1. Overdue pending tasks"
  if (source === 'personal') return PERSONAL_RANK;
  return TASK_TYPE_RANK[(task as StudyPlanTask).taskType] ?? 4;
}

/** Shifted so the numbers read naturally as "1 = do this first": overdue -> 1, coverage -> 2,
 * revision -> 3, practice -> 4, review -> 5, personal -> 12. */
function priorityOf(rank: number): number {
  return rank + 2;
}

function compareItems(a: DailyQueueItem, b: DailyQueueItem): number {
  const rankDelta = a.priority - b.priority;
  if (rankDelta !== 0) return rankDelta;
  if (a.task.date !== b.task.date) return a.task.date < b.task.date ? -1 : 1;
  return a.id.localeCompare(b.id); // final deterministic tiebreak
}

// --- Reasons (GOAL #10) -------------------------------------------------------------------------
function reasonForStudyTask(taskType: PlanTaskType, topicStatus: UnifiedTopicStatus | undefined, isToday: boolean): string {
  if (taskType === 'coverage') return 'Needs syllabus coverage';
  if (taskType === 'revision') {
    // Reuses the unified status's own pyqAttempted figure — never a second accuracy calculation —
    // only to pick the more specific of two equally-true reasons.
    if (topicStatus && topicStatus.pyqAttempted >= MIN_PYQ_ATTEMPTS_FOR_SIGNAL) return 'Weak PYQ performance';
    return 'Needs revision';
  }
  if (taskType === 'pyq_practice') return 'Needs practice';
  return isToday ? 'Scheduled today' : 'Scheduled next'; // 'review' — reserved, not yet generated
}

function buildStudyItem(task: StudyPlanTask, currentDate: string, statusByTopic: Map<string, UnifiedTopicStatus>, isToday: boolean): DailyQueueItem {
  const overdue = task.status === 'pending' && task.date < currentDate;
  const reason = overdue ? 'Overdue' : reasonForStudyTask(task.taskType, statusByTopic.get(task.topicId), isToday);
  const rank = itemRank('study_plan', task, overdue);
  return { id: `study_plan:${task.id}`, source: 'study_plan', task, priority: priorityOf(rank), reason, overdue, estimatedMinutes: task.estimatedMinutes };
}

function buildPersonalItem(task: PersonalPlanTask, currentDate: string, isToday: boolean): DailyQueueItem {
  const overdue = task.status === 'pending' && task.date < currentDate;
  const reason = overdue ? 'Overdue' : isToday ? 'Personal task' : 'Scheduled next';
  const rank = itemRank('personal', task, overdue);
  return { id: `personal:${task.id}`, source: 'personal', task, priority: priorityOf(rank), reason, overdue, estimatedMinutes: task.estimatedMinutes };
}

// --- Today's capacity (GOAL #4) -----------------------------------------------------------------
export interface DailyCapacity {
  configuredMinutes: number;
  plannedMinutes: number;
  completedMinutes: number;
  remainingMinutes: number;
  /** plannedMinutes / configuredMinutes x 100, rounded to 1 decimal. 0 when nothing is planned and
   * nothing is configured; 100 when something is planned but 0 minutes are configured (e.g. a rest
   * day with a personal task added anyway). */
  utilizationPct: number;
  overCapacity: boolean;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function computeDailyCapacity(configuredMinutes: number, todayAll: (StudyPlanTask | PersonalPlanTask)[]): DailyCapacity {
  const plannedMinutes = todayAll.reduce((sum, t) => sum + t.estimatedMinutes, 0);
  const completedMinutes = todayAll.filter((t) => t.status === 'completed').reduce((sum, t) => sum + t.estimatedMinutes, 0);
  const remainingMinutes = plannedMinutes - completedMinutes;
  const utilizationPct = configuredMinutes > 0 ? round1((plannedMinutes / configuredMinutes) * 100) : plannedMinutes > 0 ? 100 : 0;
  const overCapacity = configuredMinutes > 0 ? plannedMinutes > configuredMinutes : plannedMinutes > 0;
  return { configuredMinutes, plannedMinutes, completedMinutes, remainingMinutes, utilizationPct, overCapacity };
}

// --- Empty / explicit states (GOAL #12) ---------------------------------------------------------
export type DailyQueueStatus = 'no_plan' | 'plan_completed' | 'active';

/** Sub-state of 'active' describing today specifically — B/C/D from GOAL #12; overdue work (E) is
 * reported separately via `overdueTasks` since it can coexist with any of these. */
export type TodayState =
  | 'rest_day' // today isn't a configured study day and nothing (syllabus or personal) is scheduled on it
  | 'no_tasks_scheduled' // today IS a study day, but nothing happens to be scheduled on it (upcoming work exists later)
  | 'all_completed' // something was scheduled today and every bit of it is already completed
  | 'pending'; // the normal case — at least one pending task today

export const MAX_NEXT_UP = 5;

export type DailyQueueResult =
  | { status: 'no_plan'; currentDate: string }
  | { status: 'plan_completed'; currentDate: string }
  | {
      status: 'active';
      currentDate: string;
      todayState: TodayState;
      isStudyDay: boolean;
      capacity: DailyCapacity;
      /** Today's pending items only, prioritized — never includes a completed task. */
      todayPending: DailyQueueItem[];
      todayCompletedCount: number;
      /** Pending tasks (either source) whose date is before currentDate — never mutated, moved, or
       * auto-completed here; see GOAL #5. */
      overdueTasks: DailyQueueItem[];
      /** Up to MAX_NEXT_UP upcoming pending tasks (date after currentDate) — a preview, not a
       * second plan; see GOAL #7. */
      nextUp: DailyQueueItem[];
      /** overdueTasks + todayPending, combined and reordered by priority only — task dates are
       * never touched; see GOAL #11. */
      recommendedOrder: DailyQueueItem[];
    };

/**
 * Computes today's study queue as a read-only view over the existing plan. Never mutates `plan` or
 * `personalTasks`, never moves or completes a task, and never persists anything — callers
 * recompute this from current state each time (see GOAL #17).
 */
export function computeDailyStudyQueue(input: DailyQueueInput): DailyQueueResult {
  const { plan, personalTasks, syllabus, completedTopics, pyqPerf, currentDate } = input;

  if (!plan) return { status: 'no_plan', currentDate };

  const pendingSyllabusCount = plan.tasks.filter((t) => t.status === 'pending').length;
  const pendingPersonalCount = personalTasks.filter((t) => t.status === 'pending').length;
  if (pendingSyllabusCount === 0 && pendingPersonalCount === 0) {
    return { status: 'plan_completed', currentDate };
  }

  const statuses = computeUnifiedTopicStatus(syllabus, completedTopics, pyqPerf);
  const statusByTopic = new Map(statuses.map((s) => [s.topicId, s]));

  const isStudyDay = plan.capacity.studyDayDates.includes(currentDate);

  const todaySyllabus = plan.tasks.filter((t) => t.date === currentDate);
  const todayPersonal = personalTasks.filter((t) => t.date === currentDate);
  const todayAll = [...todaySyllabus, ...todayPersonal];

  const capacity = computeDailyCapacity(plan.capacity.minutesPerStudyDay, todayAll);

  const todayPending: DailyQueueItem[] = [
    ...todaySyllabus.filter((t) => t.status === 'pending').map((t) => buildStudyItem(t, currentDate, statusByTopic, true)),
    ...todayPersonal.filter((t) => t.status === 'pending').map((t) => buildPersonalItem(t, currentDate, true)),
  ].sort(compareItems);

  const todayCompletedCount = todayAll.filter((t) => t.status === 'completed').length;

  let todayState: TodayState;
  if (todayAll.length === 0) {
    todayState = isStudyDay ? 'no_tasks_scheduled' : 'rest_day';
  } else if (todayPending.length === 0) {
    todayState = 'all_completed';
  } else {
    todayState = 'pending';
  }

  const overdueTasks: DailyQueueItem[] = [
    ...plan.tasks
      .filter((t) => t.status === 'pending' && t.date < currentDate)
      .map((t) => buildStudyItem(t, currentDate, statusByTopic, false)),
    ...personalTasks
      .filter((t) => t.status === 'pending' && t.date < currentDate)
      .map((t) => buildPersonalItem(t, currentDate, false)),
  ].sort(compareItems);

  const nextUp: DailyQueueItem[] = [
    ...plan.tasks
      .filter((t) => t.status === 'pending' && t.date > currentDate)
      .map((t) => buildStudyItem(t, currentDate, statusByTopic, false)),
    ...personalTasks
      .filter((t) => t.status === 'pending' && t.date > currentDate)
      .map((t) => buildPersonalItem(t, currentDate, false)),
  ]
    .sort(compareItems)
    .slice(0, MAX_NEXT_UP);

  const recommendedOrder = [...overdueTasks, ...todayPending].sort(compareItems);

  return { status: 'active', currentDate, todayState, isStudyDay, capacity, todayPending, todayCompletedCount, overdueTasks, nextUp, recommendedOrder };
}
