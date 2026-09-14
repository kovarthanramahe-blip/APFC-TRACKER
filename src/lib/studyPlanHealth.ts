// Stage 5 of the Study Plan feature — a read-only "is this plan realistic, and what needs
// attention" layer on top of Stages 1-4. Nothing here is persisted (see GOAL #14): every value is
// recomputed from current state each time computePlanHealth() is called. Pure and deterministic —
// no Date.now(), no Math.random(); `currentDate` always comes from the caller.
//
// Reuses, never duplicates:
//  - lib/studyPlanAdaptive's computeRemainingCapacity for the remaining-time math (Stage 4)
//  - lib/studyPlan's calculatePlanCapacity/estimateTopicWorkload for capacity/workload (Stage 1)
//  - lib/topicStatus's computeUnifiedTopicStatus for syllabus/topic status (F6)
//  - the caller's already-computed PyqPerformanceSnapshot for PYQ signals (F3) — never a second
//    accuracy calculation
import type { PlanCapacity, StudyPlan, StudyPlanConfig } from './studyPlan';
import { calculatePlanCapacity } from './studyPlan';
import type { PersonalPlanTask } from './studyPlanEditing';
import { computeRemainingCapacity, type RemainingCapacityReport } from './studyPlanAdaptive';
import { computeUnifiedTopicStatus, WEAK_PYQ_ACCURACY_THRESHOLD, type UnifiedTopicStatus } from './topicStatus';
import type { PyqPerformanceSnapshot } from './pyqPerformance';
import type { SyllabusSubject } from './types';

export interface PlanHealthInput {
  plan: StudyPlan;
  personalTasks: PersonalPlanTask[];
  syllabus: SyllabusSubject[];
  completedTopics: Record<string, boolean>;
  pyqPerf: PyqPerformanceSnapshot | null;
  /** yyyy-mm-dd — the caller's "today". Never inferred internally. */
  currentDate: string;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// --- Required daily capacity (GOAL #3) ----------------------------------------
export interface RequiredCapacityReport {
  remainingTaskMinutes: number;
  remainingStudyDays: number;
  requiredMinutesPerStudyDay: number;
  configuredMinutesPerStudyDay: number;
  /** configured - required: positive = spare capacity, negative = shortfall. */
  capacityDifferenceMinutes: number;
  requiredHoursPerDay: number;
  configuredHoursPerDay: number;
  /** required / configured x 100. Over 100 means the daily pace needed exceeds what's configured. */
  utilizationPercentage: number;
}

function computeRequiredCapacity(capacity: PlanCapacity, remaining: RemainingCapacityReport): RequiredCapacityReport {
  // remaining.remainingPlannedMinutes already excludes completed tasks and completed personal
  // tasks, and already includes pending personal tasks — computeRemainingCapacity (Stage 4)
  // established that exact convention; reused here rather than recomputed.
  const remainingTaskMinutes = remaining.remainingPlannedMinutes;
  const remainingStudyDays = remaining.remainingStudyDays;
  // When there is work left but zero study days remain, report the full remaining amount as a
  // single-day figure (rather than dividing by zero) so the UI can still say "you'd need to fit
  // Xh in with no days left" instead of crashing or showing an empty value.
  const requiredMinutesPerStudyDay = remainingStudyDays > 0 ? Math.ceil(remainingTaskMinutes / remainingStudyDays) : remainingTaskMinutes;
  const configuredMinutesPerStudyDay = capacity.minutesPerStudyDay;
  const capacityDifferenceMinutes = configuredMinutesPerStudyDay - requiredMinutesPerStudyDay;
  const utilizationPercentage =
    configuredMinutesPerStudyDay > 0 ? round1((requiredMinutesPerStudyDay / configuredMinutesPerStudyDay) * 100) : requiredMinutesPerStudyDay > 0 ? 100 : 0;

  return {
    remainingTaskMinutes,
    remainingStudyDays,
    requiredMinutesPerStudyDay,
    configuredMinutesPerStudyDay,
    capacityDifferenceMinutes,
    requiredHoursPerDay: round1(requiredMinutesPerStudyDay / 60),
    configuredHoursPerDay: round1(configuredMinutesPerStudyDay / 60),
    utilizationPercentage,
  };
}

// --- Health verdict (GOAL #2) ---------------------------------------------------
export type PlanHealthVerdict = 'on_track' | 'tight' | 'at_risk' | 'over_capacity' | 'completed';

// Documented, non-arbitrary thresholds for downgrading an otherwise-comfortable time budget to
// 'at_risk' — the pure minutes math (computeRemainingCapacity) can look fine while the plan is
// still genuinely at risk in practice:
//  - MISSED_TASK_RISK_RATIO: once a quarter or more of outstanding pending work is already
//    overdue, the student is demonstrably falling behind the schedule, regardless of whether the
//    remaining minutes still add up on paper.
//  - LOW_RUNWAY_STUDY_DAYS: 3 or fewer study days left with any topic not yet "strong" leaves
//    essentially no room to recover from a missed day or a harder-than-expected topic.
const MISSED_TASK_RISK_RATIO = 0.25;
const LOW_RUNWAY_STUDY_DAYS = 3;

function deriveHealthVerdict(
  capacityReport: RemainingCapacityReport,
  missedTaskCount: number,
  pendingTaskCount: number,
  remainingTopics: number,
): PlanHealthVerdict {
  if (capacityReport.verdict === 'completed') return 'completed';
  if (capacityReport.verdict === 'over_capacity') return 'over_capacity';

  const missedRatio = pendingTaskCount > 0 ? missedTaskCount / pendingTaskCount : 0;
  const lowRunway = capacityReport.remainingStudyDays > 0 && capacityReport.remainingStudyDays <= LOW_RUNWAY_STUDY_DAYS && remainingTopics > 0;
  if (missedRatio >= MISSED_TASK_RISK_RATIO || lowRunway) return 'at_risk';

  return capacityReport.verdict; // 'on_track' or 'tight'
}

const HEALTH_MESSAGE: Record<PlanHealthVerdict, string> = {
  completed: 'No remaining work is currently planned.',
  on_track: 'Your plan is on track based on your current configuration and progress.',
  tight: 'Your plan fits, but leaves no buffer — a missed day could push it over capacity.',
  at_risk: 'Your plan technically fits on paper, but missed tasks or limited remaining runway put it at real risk.',
  over_capacity: 'Your plan currently requires more time than you have available.',
};

// --- Forecast (GOAL #4) ----------------------------------------------------------
// This is a PLANNING forecast — a statement about whether the current schedule's math adds up —
// never a prediction about exam performance. Wording is kept explicit about that distinction.
export type PlanForecast = 'likely_to_finish' | 'tight_finish' | 'unlikely_to_finish';

// A quarter more than the configured daily pace is a realistic stretch (a longer session, a
// skipped break); beyond that, finishing the CURRENT plan without changing its structure
// (more days, more hours, fewer tasks) is unlikely.
const FORECAST_STRETCH_RATIO = 1.25;

function computeForecast(required: RequiredCapacityReport, verdict: PlanHealthVerdict): PlanForecast {
  if (verdict === 'completed') return 'likely_to_finish';
  if (required.configuredMinutesPerStudyDay <= 0) return required.remainingTaskMinutes > 0 ? 'unlikely_to_finish' : 'likely_to_finish';
  if (required.requiredMinutesPerStudyDay <= required.configuredMinutesPerStudyDay) return 'likely_to_finish';
  if (required.requiredMinutesPerStudyDay <= required.configuredMinutesPerStudyDay * FORECAST_STRETCH_RATIO) return 'tight_finish';
  return 'unlikely_to_finish';
}

const FORECAST_MESSAGE: Record<PlanForecast, string> = {
  likely_to_finish: 'Based on your current plan and pace, you are likely to finish the remaining work by your target date.',
  tight_finish: 'Based on your current plan, finishing by your target date is possible but will require a bit more time than currently configured.',
  unlikely_to_finish: 'Based on your current plan and configured pace, finishing all remaining work by your target date is unlikely without a change.',
};

// --- Syllabus forecast (GOAL #5) --------------------------------------------------
export interface SyllabusForecast {
  totalTopics: number;
  coveredTopics: number;
  remainingTopics: number;
  strongTopics: number;
  needsRevisionTopics: number;
  needsPracticeTopics: number;
}

function computeSyllabusForecast(statuses: UnifiedTopicStatus[]): SyllabusForecast {
  const totalTopics = statuses.length;
  const coveredTopics = statuses.filter((s) => s.covered).length;
  return {
    totalTopics,
    coveredTopics,
    remainingTopics: totalTopics - coveredTopics,
    strongTopics: statuses.filter((s) => s.status === 'strong').length,
    needsRevisionTopics: statuses.filter((s) => s.status === 'needs_revision').length,
    needsPracticeTopics: statuses.filter((s) => s.status === 'needs_practice').length,
  };
}

// --- PYQ signal (GOAL #6) -----------------------------------------------------------
export interface PyqSignal {
  hasSignal: boolean;
  totalAttempted: number;
  overallAccuracy: number | null;
  weakTopics: string[];
  strongTopics: string[];
}

function computePyqSignal(pyqPerf: PyqPerformanceSnapshot | null): PyqSignal {
  if (!pyqPerf) return { hasSignal: false, totalAttempted: 0, overallAccuracy: null, weakTopics: [], strongTopics: [] };
  return {
    hasSignal: true,
    totalAttempted: pyqPerf.overall.totalAttempted,
    overallAccuracy: pyqPerf.overall.overallAccuracy,
    weakTopics: pyqPerf.weakTopics.map((t) => t.topicTitle),
    strongTopics: pyqPerf.strongestTopics.map((t) => t.topicTitle),
  };
}

// --- Bottlenecks (GOAL #7) -----------------------------------------------------------
export type BottleneckType =
  | 'insufficient_capacity'
  | 'uncovered_topics'
  | 'revision_backlog'
  | 'pending_backlog'
  | 'weak_pyq_topics'
  | 'missed_tasks'
  | 'personal_task_load';
export type BottleneckSeverity = 'low' | 'medium' | 'high';

export interface PlanBottleneck {
  type: BottleneckType;
  severity: BottleneckSeverity;
  title: string;
  detail: string;
}

const SEVERITY_ORDER: Record<BottleneckSeverity, number> = { high: 0, medium: 1, low: 2 };
const BOTTLENECK_TYPE_ORDER: BottleneckType[] = [
  'insufficient_capacity',
  'missed_tasks',
  'uncovered_topics',
  'weak_pyq_topics',
  'revision_backlog',
  'pending_backlog',
  'personal_task_load',
];

function computeBottlenecks(args: {
  required: RequiredCapacityReport;
  capacityReport: RemainingCapacityReport;
  syllabusForecast: SyllabusForecast;
  pyqSignal: PyqSignal;
  missedTaskCount: number;
  pendingTaskCount: number;
  pendingPersonalMinutes: number;
}): PlanBottleneck[] {
  const { required, capacityReport, syllabusForecast, pyqSignal, missedTaskCount, pendingTaskCount, pendingPersonalMinutes } = args;
  const bottlenecks: PlanBottleneck[] = [];

  if (required.capacityDifferenceMinutes < 0) {
    const shortfall = Math.abs(required.capacityDifferenceMinutes);
    bottlenecks.push({
      type: 'insufficient_capacity',
      severity: shortfall >= required.configuredMinutesPerStudyDay * 0.5 ? 'high' : 'medium',
      title: 'Insufficient daily capacity',
      detail: `About ${shortfall} more minute${shortfall === 1 ? '' : 's'}/day would be needed than your configured ${required.configuredMinutesPerStudyDay} min/day.`,
    });
  }

  if (missedTaskCount > 0) {
    bottlenecks.push({
      type: 'missed_tasks',
      severity: missedTaskCount >= 6 ? 'high' : missedTaskCount >= 3 ? 'medium' : 'low',
      title: 'Missed or overdue tasks',
      detail: `${missedTaskCount} pending task${missedTaskCount === 1 ? ' is' : 's are'} scheduled before today.`,
    });
  }

  if (syllabusForecast.totalTopics > 0) {
    const ratio = syllabusForecast.remainingTopics / syllabusForecast.totalTopics;
    if (ratio >= 0.3) {
      bottlenecks.push({
        type: 'uncovered_topics',
        severity: ratio >= 0.6 ? 'high' : 'medium',
        title: 'Many topics still uncovered',
        detail: `${syllabusForecast.remainingTopics} of ${syllabusForecast.totalTopics} topics are not yet covered.`,
      });
    }
  }

  if (pyqSignal.hasSignal && pyqSignal.overallAccuracy !== null && pyqSignal.overallAccuracy < WEAK_PYQ_ACCURACY_THRESHOLD && pyqSignal.weakTopics.length > 0) {
    bottlenecks.push({
      type: 'weak_pyq_topics',
      severity: pyqSignal.overallAccuracy < WEAK_PYQ_ACCURACY_THRESHOLD / 2 ? 'high' : 'medium',
      title: 'Weak PYQ performance',
      detail: `Overall PYQ accuracy is ${round1(pyqSignal.overallAccuracy)}%, with ${pyqSignal.weakTopics.length} topic${pyqSignal.weakTopics.length === 1 ? '' : 's'} flagged as weak.`,
    });
  }

  if (syllabusForecast.needsRevisionTopics >= 5) {
    bottlenecks.push({
      type: 'revision_backlog',
      severity: syllabusForecast.needsRevisionTopics >= 10 ? 'high' : 'medium',
      title: 'Revision backlog building up',
      detail: `${syllabusForecast.needsRevisionTopics} covered topics currently need revision.`,
    });
  }

  const avgTasksPerDay = capacityReport.remainingStudyDays > 0 ? pendingTaskCount / capacityReport.remainingStudyDays : pendingTaskCount;
  if (pendingTaskCount > 0 && avgTasksPerDay > 3) {
    bottlenecks.push({
      type: 'pending_backlog',
      severity: avgTasksPerDay > 6 ? 'high' : 'medium',
      title: 'A lot of pending tasks per day',
      detail: `${pendingTaskCount} pending tasks average ${round1(avgTasksPerDay)}/study day for the remaining schedule.`,
    });
  }

  if (pendingPersonalMinutes > 0 && capacityReport.remainingAvailableMinutes > 0 && pendingPersonalMinutes / capacityReport.remainingAvailableMinutes >= 0.15) {
    bottlenecks.push({
      type: 'personal_task_load',
      severity: pendingPersonalMinutes / capacityReport.remainingAvailableMinutes >= 0.3 ? 'high' : 'medium',
      title: 'Personal tasks are using a large share of your time',
      detail: `Personal tasks account for about ${round1((pendingPersonalMinutes / capacityReport.remainingAvailableMinutes) * 100)}% of your remaining available time.`,
    });
  }

  return bottlenecks.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || BOTTLENECK_TYPE_ORDER.indexOf(a.type) - BOTTLENECK_TYPE_ORDER.indexOf(b.type),
  );
}

// --- Recommendations (GOAL #8) --------------------------------------------------------
// Every recommendation is derived directly from a computed condition above — never generic
// motivational text.
function computeRecommendations(verdict: PlanHealthVerdict, bottlenecks: PlanBottleneck[], required: RequiredCapacityReport): string[] {
  if (verdict === 'completed') return ['All planned work is complete — nothing further is scheduled.'];

  const has = (t: BottleneckType) => bottlenecks.some((b) => b.type === t);
  const recs: string[] = [];

  if (has('insufficient_capacity')) {
    const extra = Math.max(5, Math.ceil(Math.abs(required.capacityDifferenceMinutes) / 5) * 5);
    recs.push(`Increase daily study time by about ${extra} minutes, or add one more study day per week.`);
  }
  if (has('uncovered_topics')) recs.push('Prioritize uncovered syllabus topics before revisiting completed ones.');
  if (has('weak_pyq_topics')) recs.push('Practice your weak PYQ topics to improve accuracy.');
  if (has('missed_tasks') || has('pending_backlog')) recs.push('Rebalance the remaining plan to reschedule missed or backed-up tasks.');
  if (has('revision_backlog')) recs.push('Dedicate a few sessions specifically to revision before adding new coverage.');
  if (has('personal_task_load')) recs.push('Personal tasks are using a large share of your remaining time — consider trimming or moving some.');

  if (recs.length === 0) recs.push('You are currently on track — continue the current schedule.');
  return recs;
}

// --- Main report (GOAL #1) ---------------------------------------------------------------
export interface PlanHealthReport {
  verdict: PlanHealthVerdict;
  message: string;
  capacity: RemainingCapacityReport;
  required: RequiredCapacityReport;
  forecast: PlanForecast;
  forecastMessage: string;
  syllabus: SyllabusForecast;
  pyq: PyqSignal;
  bottlenecks: PlanBottleneck[];
  recommendations: string[];
  missedTaskCount: number;
}

export function computePlanHealth(input: PlanHealthInput): PlanHealthReport {
  const { plan, personalTasks, syllabus, completedTopics, pyqPerf, currentDate } = input;

  const capacityReport = computeRemainingCapacity(plan.capacity, currentDate, plan.tasks, personalTasks);
  const required = computeRequiredCapacity(plan.capacity, capacityReport);

  const statuses = computeUnifiedTopicStatus(syllabus, completedTopics, pyqPerf);
  const syllabusForecast = computeSyllabusForecast(statuses);
  const pyqSignal = computePyqSignal(pyqPerf);

  const missedTaskCount = plan.tasks.filter((t) => t.status === 'pending' && t.date < currentDate).length;
  const pendingPersonalMinutes = personalTasks.filter((t) => t.status === 'pending').reduce((sum, t) => sum + t.estimatedMinutes, 0);
  const pendingTaskCount = plan.tasks.filter((t) => t.status === 'pending').length + personalTasks.filter((t) => t.status === 'pending').length;

  const verdict = deriveHealthVerdict(capacityReport, missedTaskCount, pendingTaskCount, syllabusForecast.remainingTopics);
  const forecast = computeForecast(required, verdict);

  const bottlenecks = computeBottlenecks({ required, capacityReport, syllabusForecast, pyqSignal, missedTaskCount, pendingTaskCount, pendingPersonalMinutes });
  const recommendations = computeRecommendations(verdict, bottlenecks, required);

  return {
    verdict,
    message: HEALTH_MESSAGE[verdict],
    capacity: capacityReport,
    required,
    forecast,
    forecastMessage: FORECAST_MESSAGE[forecast],
    syllabus: syllabusForecast,
    pyq: pyqSignal,
    bottlenecks,
    recommendations,
    missedTaskCount,
  };
}

// --- Scenario helpers (GOAL #9, #10) ---------------------------------------------------------
// Both are pure "what if" simulations: they build a modified, ephemeral copy of the plan's
// capacity/config and feed it back through computePlanHealth — never mutating the real
// input.plan or any stored configuration.

/** "If I lose N upcoming study days, what happens?" — removes the next N study days at or after
 * `currentDate` from the capacity used, without touching the plan's actual configuration. */
export function forecastAfterMissedDays(input: PlanHealthInput, missedDays: number): PlanHealthReport {
  if (missedDays <= 0) return computePlanHealth(input);
  const upcoming = input.plan.capacity.studyDayDates.filter((d) => d >= input.currentDate);
  const removed = new Set(upcoming.slice(0, missedDays));
  const adjustedCapacity: PlanCapacity = { ...input.plan.capacity, studyDayDates: input.plan.capacity.studyDayDates.filter((d) => !removed.has(d)) };
  return computePlanHealth({ ...input, plan: { ...input.plan, capacity: adjustedCapacity } });
}

function shiftDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "If the target date moves by N days (positive = later, negative = earlier), what happens?" —
 * recalculates capacity via the same lib/studyPlan.calculatePlanCapacity the engine itself uses,
 * never a re-implementation of that date/weekday math. */
export function forecastWithTargetDateShift(input: PlanHealthInput, dayShift: number): PlanHealthReport {
  if (dayShift === 0) return computePlanHealth(input);
  const newConfig: StudyPlanConfig = { ...input.plan.config, targetDate: shiftDateStr(input.plan.config.targetDate, dayShift) };
  const newCapacity = calculatePlanCapacity(newConfig);
  return computePlanHealth({ ...input, plan: { ...input.plan, config: newConfig, capacity: newCapacity } });
}
