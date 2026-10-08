import type { StudyPlanTask } from './studyPlan';
import type { PersonalPlanTask } from './studyPlanEditing';
import type { DailyQueueResult, DailyQueueItem } from './studyPlanDailyQueue';
import { getLocalDateString } from './utils';

// Planner + Task OS (Phase 19) — a thin, pure VIEW over the existing planning engine, the same
// discipline lib/revisionOS.ts/lib/syllabusOS.ts already established for their own domains. Today
// and overdue are already computed richly by lib/studyPlanDailyQueue.ts's computeDailyStudyQueue
// (used verbatim here, never re-derived) — this module adds exactly the one thing that engine
// doesn't give a caller: a full (uncapped) count of PENDING work further out than today, bucketed
// into tomorrow/this week/later, for a "Day/week planning" overview. No second calendar engine, no
// second priority ranking — `priorityItems` below is `dailyQueue.recommendedOrder` itself, sliced.

export type PlannerBucketKey = 'tomorrow' | 'thisWeek' | 'later';

export const PLANNER_BUCKET_ORDER: readonly PlannerBucketKey[] = ['tomorrow', 'thisWeek', 'later'];

export const PLANNER_BUCKET_LABEL: Record<PlannerBucketKey, string> = {
  tomorrow: 'Tomorrow',
  thisWeek: 'This Week',
  later: 'Later',
};

export interface PlannerTaskRef {
  id: string;
  kind: 'syllabus' | 'personal';
  title: string;
  date: string;
  estimatedMinutes: number;
  /** Present only for a syllabus task — a real foreign key into SYLLABUS (see lib/studyPlan.ts's
   * own StudyPlanTask), never fabricated for a personal task. */
  topicId?: string;
}

function addDaysToDateString(today: string, days: number): string {
  const d = new Date(today + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return getLocalDateString(d);
}

function classifyBucket(date: string, tomorrow: string, weekEnd: string): PlannerBucketKey {
  if (date === tomorrow) return 'tomorrow';
  if (date <= weekEnd) return 'thisWeek';
  return 'later';
}

/**
 * Buckets every PENDING task (syllabus + personal) with a date STRICTLY AFTER `today` into
 * tomorrow/thisWeek/later — complementary to computeDailyStudyQueue's own today/overdue, never a
 * re-derivation of either. A completed/skipped task is never included: this answers "what remains
 * ahead", not "what happened".
 */
export function bucketUpcomingPlannerTasks(
  planTasks: readonly StudyPlanTask[],
  personalTasks: readonly PersonalPlanTask[],
  today: string,
): Record<PlannerBucketKey, PlannerTaskRef[]> {
  const tomorrow = addDaysToDateString(today, 1);
  const weekEnd = addDaysToDateString(today, 7);
  const buckets: Record<PlannerBucketKey, PlannerTaskRef[]> = { tomorrow: [], thisWeek: [], later: [] };

  const refs: PlannerTaskRef[] = [
    ...planTasks
      .filter((t) => t.status === 'pending' && t.date > today)
      .map((t) => ({ id: t.id, kind: 'syllabus' as const, title: t.title, date: t.date, estimatedMinutes: t.estimatedMinutes, topicId: t.topicId })),
    ...personalTasks
      .filter((t) => t.status === 'pending' && t.date > today)
      .map((t) => ({ id: t.id, kind: 'personal' as const, title: t.title, date: t.date, estimatedMinutes: t.estimatedMinutes })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  for (const ref of refs) buckets[classifyBucket(ref.date, tomorrow, weekEnd)].push(ref);
  return buckets;
}

export interface PlannerOverview {
  /** true only when computeDailyStudyQueue's own status is 'active' — see that module's own
   * DailyQueueResult union for 'no_plan'/'plan_completed'. */
  hasActivePlan: boolean;
  todayRemainingCount: number;
  todayCompletedCount: number;
  overdueCount: number;
  tomorrowCount: number;
  thisWeekCount: number;
  laterCount: number;
  /** computeDailyStudyQueue's own recommendedOrder (overdue-first, then today, already ranked by
   * task type/urgency), sliced — never a second priority calculation. Empty when there's no active
   * plan or nothing is due/pending today. */
  priorityItems: DailyQueueItem[];
}

const DEFAULT_MAX_PRIORITY_ITEMS = 4;

/**
 * Composes the existing daily queue (today/overdue, already computed by the caller via
 * computeDailyStudyQueue — see pages/StudyPlan.tsx/lib/commandCentreHome.ts for the existing call
 * sites) with the upcoming-task buckets above into one overview. Never mutates either input, never
 * recomputes what computeDailyStudyQueue already decided.
 */
export function computePlannerOverview(
  dailyQueue: DailyQueueResult,
  planTasks: readonly StudyPlanTask[],
  personalTasks: readonly PersonalPlanTask[],
  today: string,
  maxPriorityItems: number = DEFAULT_MAX_PRIORITY_ITEMS,
): PlannerOverview {
  const upcoming = bucketUpcomingPlannerTasks(planTasks, personalTasks, today);
  const hasActivePlan = dailyQueue.status === 'active';
  return {
    hasActivePlan,
    todayRemainingCount: hasActivePlan && dailyQueue.status === 'active' ? dailyQueue.todayPending.length : 0,
    todayCompletedCount: hasActivePlan && dailyQueue.status === 'active' ? dailyQueue.todayCompletedCount : 0,
    overdueCount: hasActivePlan && dailyQueue.status === 'active' ? dailyQueue.overdueTasks.length : 0,
    tomorrowCount: upcoming.tomorrow.length,
    thisWeekCount: upcoming.thisWeek.length,
    laterCount: upcoming.later.length,
    priorityItems: hasActivePlan && dailyQueue.status === 'active' ? dailyQueue.recommendedOrder.slice(0, maxPriorityItems) : [],
  };
}
