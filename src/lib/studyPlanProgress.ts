// Stage 8 of the Study Plan feature — read-only execution analytics comparing PLANNED WORK vs
// COMPLETED PLANNED WORK vs ACTUAL STUDY ACTIVITY. This is not a second planning engine and not a
// second topic-status system: it only reads plan.tasks/personalTasks (Stage 1/3) and the app's
// EXISTING actual-activity record — PomodoroSession (see lib/types.ts; the same `sessions` array
// Dashboard's "Study Time" card and Analytics' "Focus Minutes" chart already read, filtered to
// mode === 'focus', exactly like both of those already do). Pure and deterministic — no Date.now();
// `currentDate` is always supplied by the caller. Nothing here mutates the plan, a task, a session,
// or completedTopics — read-only analytics, never persisted (callers recompute on every render).
import type { PersonalTaskType, PersonalPlanTask } from './studyPlanEditing';
import type { PlanTaskStatus, PlanTaskType, StudyPlan, StudyPlanTask } from './studyPlan';
import type { PomodoroSession } from './types';

export interface StudyPlanProgressInput {
  plan: StudyPlan | null;
  personalTasks: PersonalPlanTask[];
  /** The app's existing actual-study-activity record (store.sessions) — never a second model. */
  sessions: PomodoroSession[];
  /** yyyy-mm-dd — the caller's "today". Never inferred internally, so this module stays pure. */
  currentDate: string;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? round1((part / whole) * 100) : 0;
}

// --- Plan completion (GOAL #3) + planned minutes (GOAL #4) --------------------------------------
export interface TaskCountBreakdown {
  planned: number;
  completed: number;
  pending: number;
  completionPct: number;
}

export interface MinutesBreakdown {
  plannedMinutes: number;
  completedMinutes: number;
  remainingMinutes: number;
  completionPct: number;
}

function countBreakdown(tasks: { status: PlanTaskStatus }[]): TaskCountBreakdown {
  const planned = tasks.length;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  return { planned, completed, pending: planned - completed, completionPct: pct(completed, planned) };
}

function minutesBreakdown(tasks: { status: PlanTaskStatus; estimatedMinutes: number }[]): MinutesBreakdown {
  const plannedMinutes = tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
  const completedMinutes = tasks.filter((t) => t.status === 'completed').reduce((sum, t) => sum + t.estimatedMinutes, 0);
  return { plannedMinutes, completedMinutes, remainingMinutes: plannedMinutes - completedMinutes, completionPct: pct(completedMinutes, plannedMinutes) };
}

// --- Actual study time (GOAL #5) -----------------------------------------------------------------
export interface ActualStudyTime {
  actualStudyMinutes: number;
  actualStudySessions: number;
  /** Over the plan's elapsed configured study days (see below) — 0 when none have elapsed yet. */
  avgActualMinutesPerStudyDay: number;
  studyDaysWithActivity: number;
  studyDaysWithoutActivity: number;
}

function sessionDate(s: PomodoroSession): string {
  return s.startedAt.slice(0, 10);
}

/** Aggregates the EXISTING PomodoroSession record for the plan period so far: every completed
 * focus session dated between the plan's startDate and currentDate (inclusive) — deliberately not
 * restricted to only the plan's configured study days, since real study can happen on a rest day
 * too (see GOAL #6: "not a strict accounting system"). `elapsedStudyDayDates` (the configured study
 * days that have already occurred) is what "days with/without activity" is measured against. */
function computeActualStudyTime(sessions: PomodoroSession[], startDate: string, currentDate: string, elapsedStudyDayDates: string[]): ActualStudyTime {
  const focusSessions = sessions.filter((s) => s.mode === 'focus' && sessionDate(s) >= startDate && sessionDate(s) <= currentDate);
  const actualStudyMinutes = focusSessions.reduce((sum, s) => sum + s.durationMinutes, 0);
  const actualStudySessions = focusSessions.length;

  const minutesByDate = new Map<string, number>();
  for (const s of focusSessions) minutesByDate.set(sessionDate(s), (minutesByDate.get(sessionDate(s)) ?? 0) + s.durationMinutes);

  const studyDaysWithActivity = elapsedStudyDayDates.filter((d) => (minutesByDate.get(d) ?? 0) > 0).length;
  const studyDaysWithoutActivity = elapsedStudyDayDates.length - studyDaysWithActivity;
  const avgActualMinutesPerStudyDay = elapsedStudyDayDates.length > 0 ? round1(actualStudyMinutes / elapsedStudyDayDates.length) : 0;

  return { actualStudyMinutes, actualStudySessions, avgActualMinutesPerStudyDay, studyDaysWithActivity, studyDaysWithoutActivity };
}

// --- Planned vs actual (GOAL #6) -----------------------------------------------------------------
export interface PlannedVsActual {
  /** Sum of syllabus tasks' estimatedMinutes dated on or before currentDate (regardless of
   * status) — "how much work was supposed to have happened by now", the fair baseline to compare
   * actual minutes against (not the whole plan's total, which includes future work). */
  plannedMinutesToDate: number;
  actualStudyMinutes: number;
  /** actualStudyMinutes as a % of plannedMinutesToDate. An EXECUTION signal, not exact accounting
   * — a student can study a topic without a matching task, or vice versa. */
  executionPercentage: number;
  /** actualStudyMinutes - plannedMinutesToDate. Positive = surplus (studying more than scheduled
   * time-wise), negative = deficit. */
  surplusDeficitMinutes: number;
}

function computePlannedVsActual(tasks: StudyPlanTask[], currentDate: string, actualStudyMinutes: number): PlannedVsActual {
  const plannedMinutesToDate = tasks.filter((t) => t.date <= currentDate).reduce((sum, t) => sum + t.estimatedMinutes, 0);
  return {
    plannedMinutesToDate,
    actualStudyMinutes,
    executionPercentage: plannedMinutesToDate > 0 ? pct(actualStudyMinutes, plannedMinutesToDate) : actualStudyMinutes > 0 ? 100 : 0,
    surplusDeficitMinutes: actualStudyMinutes - plannedMinutesToDate,
  };
}

// --- Weekly progress (GOAL #7) -------------------------------------------------------------------
export interface WeeklyProgress {
  weekStart: string;
  weekEnd: string;
  plannedMinutes: number;
  completedPlannedMinutes: number;
  actualStudyMinutes: number;
  plannedTaskCount: number;
  completedTaskCount: number;
  executionPercentage: number;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Weeks are 7-day buckets anchored to the plan's own startDate (not calendar-week-of-year, which
 * would be arbitrary relative to when the plan actually starts) — deterministic and matches the
 * project's existing yyyy-mm-dd, inclusive-range date convention. */
function computeWeeklyProgress(tasks: StudyPlanTask[], sessions: PomodoroSession[], startDate: string, targetDate: string): WeeklyProgress[] {
  const weeks: WeeklyProgress[] = [];
  let cursor = startDate;
  while (cursor <= targetDate) {
    const weekEnd = addDays(cursor, 6) > targetDate ? targetDate : addDays(cursor, 6);
    const weekTasks = tasks.filter((t) => t.date >= cursor && t.date <= weekEnd);
    const weekSessions = sessions.filter((s) => s.mode === 'focus' && sessionDate(s) >= cursor && sessionDate(s) <= weekEnd);
    const plannedMinutes = weekTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
    const completedPlannedMinutes = weekTasks.filter((t) => t.status === 'completed').reduce((sum, t) => sum + t.estimatedMinutes, 0);
    weeks.push({
      weekStart: cursor,
      weekEnd,
      plannedMinutes,
      completedPlannedMinutes,
      actualStudyMinutes: weekSessions.reduce((sum, s) => sum + s.durationMinutes, 0),
      plannedTaskCount: weekTasks.length,
      completedTaskCount: weekTasks.filter((t) => t.status === 'completed').length,
      executionPercentage: pct(completedPlannedMinutes, plannedMinutes),
    });
    cursor = addDays(weekEnd, 1);
  }
  return weeks;
}

// --- Subject progress (GOAL #8) ------------------------------------------------------------------
export interface SubjectProgress {
  subjectId: string;
  plannedTaskCount: number;
  completedTaskCount: number;
  plannedMinutes: number;
  completedMinutes: number;
  completionPct: number;
}

/** Groups by the existing task.subjectId (set by lib/studyPlan from the real syllabus at
 * generation time) — no new subject mapping invented. Personal tasks have no subjectId and are
 * never included here (see GOAL #8's "Personal tasks must remain separate"). */
function computeSubjectProgress(tasks: StudyPlanTask[]): SubjectProgress[] {
  const bySubject = new Map<string, StudyPlanTask[]>();
  for (const t of tasks) {
    const list = bySubject.get(t.subjectId);
    if (list) list.push(t);
    else bySubject.set(t.subjectId, [t]);
  }
  return [...bySubject.entries()]
    .map(([subjectId, subjectTasks]) => {
      const plannedMinutes = subjectTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
      const completedMinutes = subjectTasks.filter((t) => t.status === 'completed').reduce((sum, t) => sum + t.estimatedMinutes, 0);
      return {
        subjectId,
        plannedTaskCount: subjectTasks.length,
        completedTaskCount: subjectTasks.filter((t) => t.status === 'completed').length,
        plannedMinutes,
        completedMinutes,
        completionPct: pct(completedMinutes, plannedMinutes),
      };
    })
    .sort((a, b) => a.subjectId.localeCompare(b.subjectId));
}

// --- Task-type progress (GOAL #9) ----------------------------------------------------------------
export interface TaskTypeProgress extends TaskCountBreakdown {
  plannedMinutes: number;
  completedMinutes: number;
}

const TASK_TYPES: PlanTaskType[] = ['coverage', 'revision', 'pyq_practice', 'review'];

function taskTypeProgress(tasks: StudyPlanTask[]): Record<PlanTaskType, TaskTypeProgress> {
  const result = {} as Record<PlanTaskType, TaskTypeProgress>;
  for (const type of TASK_TYPES) {
    const typeTasks = tasks.filter((t) => t.taskType === type);
    const counts = countBreakdown(typeTasks);
    const minutes = minutesBreakdown(typeTasks);
    result[type] = { ...counts, plannedMinutes: minutes.plannedMinutes, completedMinutes: minutes.completedMinutes };
  }
  return result;
}

function personalTaskTypeProgress(personalTasks: PersonalPlanTask[]): Record<PersonalTaskType, TaskTypeProgress> {
  const counts = countBreakdown(personalTasks);
  const minutes = minutesBreakdown(personalTasks);
  return { personal: { ...counts, plannedMinutes: minutes.plannedMinutes, completedMinutes: minutes.completedMinutes } };
}

// --- Execution state (GOAL #10) ------------------------------------------------------------------
export type ExecutionState = 'ahead' | 'on_track' | 'behind' | 'inactive';

// Documented, non-arbitrary tolerance: the elapsed-plan-period % and the completed-workload % are
// compared directly (see GOAL #10's own "40% elapsed / ~40% complete -> on_track" example); a gap
// of more than this many percentage points either way is "substantially more/less", not noise.
export const EXECUTION_TOLERANCE_PCT = 10;

function deriveExecutionState(planElapsedPct: number, workloadCompletedPct: number, totalPlannedMinutes: number, actualStudyMinutes: number): ExecutionState {
  if (totalPlannedMinutes === 0) return 'inactive'; // nothing planned to grade execution against
  if (actualStudyMinutes === 0) return 'inactive'; // no real study activity recorded in the period at all
  const diff = workloadCompletedPct - planElapsedPct;
  if (diff > EXECUTION_TOLERANCE_PCT) return 'ahead';
  if (diff < -EXECUTION_TOLERANCE_PCT) return 'behind';
  return 'on_track';
}

// --- Overdue (GOAL #11) --------------------------------------------------------------------------
export interface OverdueSummary {
  overduePendingCount: number;
  overdueMinutes: number;
  /** Tasks scheduled before currentDate that ARE marked completed — "where identifiable" per
   * GOAL #11: StudyPlanTask/PersonalPlanTask carry no completedAt timestamp, so this can only ever
   * mean "scheduled for a past date and found completed", not "completed late" specifically. */
  completedOverdueCount: number;
}

function computeOverdue(allTasks: { status: PlanTaskStatus; date: string; estimatedMinutes: number }[], currentDate: string): OverdueSummary {
  const past = allTasks.filter((t) => t.date < currentDate);
  const overduePending = past.filter((t) => t.status === 'pending');
  return {
    overduePendingCount: overduePending.length,
    overdueMinutes: overduePending.reduce((sum, t) => sum + t.estimatedMinutes, 0),
    completedOverdueCount: past.filter((t) => t.status === 'completed').length,
  };
}

// --- Topic execution (GOAL #12) ------------------------------------------------------------------
export interface TopicExecutionSummary {
  topicsWithCompletedPlannedWork: string[];
  topicsWithPendingPlannedWork: string[];
  /** Subjects, not individual topics: PomodoroSession only ever records `subject` (see
   * lib/types.ts), never a topicId, so there is no real per-topic actual-study-time link in this
   * app's existing data model — reported at the honest granularity the data actually supports
   * rather than inventing a topic-level join. Subjects with planned work in this plan but zero
   * actual focus minutes recorded in the plan period. */
  subjectsWithPlannedWorkNoActualActivity: string[];
}

function computeTopicExecution(tasks: StudyPlanTask[], sessions: PomodoroSession[], startDate: string, currentDate: string): TopicExecutionSummary {
  const topicsWithCompletedPlannedWork = [...new Set(tasks.filter((t) => t.status === 'completed').map((t) => t.topicId))].sort();
  const topicsWithPendingPlannedWork = [...new Set(tasks.filter((t) => t.status === 'pending').map((t) => t.topicId))].sort();

  const subjectsWithPlannedWork = new Set(tasks.map((t) => t.subjectId));
  const subjectsWithActivity = new Set(
    sessions
      .filter((s) => s.mode === 'focus' && s.subject && s.subject !== 'general' && sessionDate(s) >= startDate && sessionDate(s) <= currentDate)
      .map((s) => s.subject as string),
  );
  const subjectsWithPlannedWorkNoActualActivity = [...subjectsWithPlannedWork].filter((id) => !subjectsWithActivity.has(id)).sort();

  return { topicsWithCompletedPlannedWork, topicsWithPendingPlannedWork, subjectsWithPlannedWorkNoActualActivity };
}

// --- Recommendations (GOAL #13) ------------------------------------------------------------------
// A gap of more than this many percentage points between two task-type completion rates is treated
// as "one is being neglected relative to the other" — reuses the same EXECUTION_TOLERANCE_PCT-style
// magnitude rather than inventing a second, unrelated threshold.
const NEGLECT_GAP_PCT = 30;

function computeRecommendations(
  executionState: ExecutionState,
  byType: Record<PlanTaskType, TaskTypeProgress>,
  plannedVsActual: PlannedVsActual,
): string[] {
  const recs: string[] = [];

  if (executionState === 'ahead') recs.push('You are completing planned work faster than expected.');
  if (executionState === 'behind') recs.push('Planned task completion is behind the elapsed plan.');
  if (executionState === 'inactive') recs.push('No study activity has been recorded during the current plan period.');

  if (byType.revision.planned > 0 && byType.coverage.completionPct - byType.revision.completionPct > NEGLECT_GAP_PCT) {
    recs.push('You have completed coverage tasks but revision tasks are accumulating.');
  }
  if (byType.pyq_practice.planned > 0 && byType.coverage.completionPct - byType.pyq_practice.completionPct > NEGLECT_GAP_PCT) {
    recs.push('PYQ practice completion is lagging behind the plan.');
  }

  if (executionState !== 'inactive' && plannedVsActual.plannedMinutesToDate > 0 && plannedVsActual.executionPercentage < 100 - EXECUTION_TOLERANCE_PCT) {
    recs.push('Actual study time is below planned capacity.');
  }

  if (recs.length === 0) recs.push('Plan execution is tracking the elapsed plan period.');
  return recs;
}

// --- Main report ----------------------------------------------------------------------------------
export interface StudyPlanProgressReport {
  currentDate: string;
  taskCompletion: TaskCountBreakdown;
  plannedMinutes: MinutesBreakdown;
  personalTaskCompletion: TaskCountBreakdown;
  personalMinutes: MinutesBreakdown;
  actualStudyTime: ActualStudyTime;
  plannedVsActual: PlannedVsActual;
  weeklyProgress: WeeklyProgress[];
  subjectProgress: SubjectProgress[];
  taskTypeProgress: Record<PlanTaskType, TaskTypeProgress>;
  personalTaskTypeProgress: Record<PersonalTaskType, TaskTypeProgress>;
  executionState: ExecutionState;
  /** % of the plan's calendar period ([startDate, targetDate]) that has elapsed as of currentDate,
   * clamped to [0, 100]. */
  planElapsedPct: number;
  overdue: OverdueSummary;
  topicExecution: TopicExecutionSummary;
  recommendations: string[];
}

export type StudyPlanProgressResult = { status: 'no_plan'; currentDate: string } | ({ status: 'ready' } & StudyPlanProgressReport);

function planElapsedPercentage(startDate: string, targetDate: string, currentDate: string): number {
  const start = new Date(startDate + 'T00:00:00').getTime();
  const target = new Date(targetDate + 'T00:00:00').getTime();
  const current = new Date(currentDate + 'T00:00:00').getTime();
  const totalDays = Math.max(1, Math.round((target - start) / 86_400_000) + 1);
  const elapsedDays = Math.min(totalDays, Math.max(0, Math.round((current - start) / 86_400_000) + 1));
  return round1((elapsedDays / totalDays) * 100);
}

/**
 * Computes plan-execution analytics as a read-only view: PLANNED vs COMPLETED PLANNED vs ACTUAL
 * (PomodoroSession) study activity. Never mutates `plan`, its tasks, `personalTasks`, or
 * `sessions`, and nothing here is persisted — callers recompute this from current state.
 */
export function computeStudyPlanProgress(input: StudyPlanProgressInput): StudyPlanProgressResult {
  const { plan, personalTasks, sessions, currentDate } = input;
  if (!plan) return { status: 'no_plan', currentDate };

  const { startDate, targetDate } = plan.config;
  const tasks = plan.tasks;

  const taskCompletion = countBreakdown(tasks);
  const plannedMinutes = minutesBreakdown(tasks);
  const personalTaskCompletion = countBreakdown(personalTasks);
  const personalMinutes = minutesBreakdown(personalTasks);

  const elapsedStudyDayDates = plan.capacity.studyDayDates.filter((d) => d <= currentDate);
  const actualStudyTime = computeActualStudyTime(sessions, startDate, currentDate, elapsedStudyDayDates);
  const plannedVsActual = computePlannedVsActual(tasks, currentDate, actualStudyTime.actualStudyMinutes);

  const weeklyProgress = computeWeeklyProgress(tasks, sessions, startDate, targetDate);
  const subjectProgress = computeSubjectProgress(tasks);
  const byType = taskTypeProgress(tasks);
  const byPersonalType = personalTaskTypeProgress(personalTasks);

  const planElapsedPct = planElapsedPercentage(startDate, targetDate, currentDate);
  const executionState = deriveExecutionState(planElapsedPct, plannedMinutes.completionPct, plannedMinutes.plannedMinutes, actualStudyTime.actualStudyMinutes);

  const overdue = computeOverdue([...tasks, ...personalTasks], currentDate);
  const topicExecution = computeTopicExecution(tasks, sessions, startDate, currentDate);
  const recommendations = computeRecommendations(executionState, byType, plannedVsActual);

  return {
    status: 'ready',
    currentDate,
    taskCompletion,
    plannedMinutes,
    personalTaskCompletion,
    personalMinutes,
    actualStudyTime,
    plannedVsActual,
    weeklyProgress,
    subjectProgress,
    taskTypeProgress: byType,
    personalTaskTypeProgress: byPersonalType,
    executionState,
    planElapsedPct,
    overdue,
    topicExecution,
    recommendations,
  };
}
